import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FREEMIUM_LIMIT = 15

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const bodyText = await req.text();
    let requestData;
    try {
      requestData = JSON.parse(bodyText);
    } catch {
      throw new Error("Invalid JSON in request body");
    }

    if (requestData.action === 'delete-account') {
      const { data: subData } = await supabaseClient
        .from('subscriptions')
        .select('stripe_customer_id, stripe_subscription_id, status')
        .eq('user_id', user.id)
        .single();

      if (subData?.stripe_subscription_id && subData.status === 'active') {
        try {
          const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
          if (stripeKey) {
            const cancelResp = await fetch(`https://api.stripe.com/v1/subscriptions/${subData.stripe_subscription_id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${stripeKey}` },
            });
            if (!cancelResp.ok) {
              console.error(`Stripe cancel failed: ${await cancelResp.text()}`);
            }
          }
        } catch (e) {
          console.error(`Stripe cancel error: ${e.message}`);
        }
      }

      await supabaseAdmin.from('subscriptions').delete().eq('user_id', user.id);
      await supabaseAdmin.from('freemium_grades').delete().eq('user_id', user.id);

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (deleteError) throw new Error(`Account deletion failed: ${deleteError.message}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (requestData.action === 'get-plan') {
      const { data: subData, error: subError } = await supabaseClient
        .from('subscriptions')
        .select('status, price_id')
        .eq('user_id', user.id)
        .single();

      const plan = (!subError && subData) ? subData : { status: 'none', price_id: null };
      return new Response(JSON.stringify({ plan }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (requestData.action === 'get-freemium-status') {
      const { data: subData } = await supabaseClient
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .single();

      if (subData?.status === 'active' || subData?.status === 'byok' || subData?.status === 'lifetime') {
        return new Response(JSON.stringify({ isPaid: true, remaining: null }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const remaining = await getOrCreateFreemiumRecord(supabaseAdmin, user.id);
      return new Response(JSON.stringify({ isPaid: false, remaining }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: subData, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .single();

    const isPaidUser = !subError && subData && (subData.status === 'active' || subData.status === 'byok' || subData.status === 'lifetime');

    if (isPaidUser && subData.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Active subscription required. BYOK users must use their own API key.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!isPaidUser && !requestData.isMainCard) {
      return new Response(JSON.stringify({ error: 'Active subscription required.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!isPaidUser && requestData.isMainCard) {
      const remaining = await getOrCreateFreemiumRecord(supabaseAdmin, user.id);

      if (remaining <= 0) {
        return new Response(JSON.stringify({
          error: 'freemium_exhausted',
          remaining: 0,
          message: 'You have used all 15 free grades. Upgrade to Pro for unlimited grading.'
        }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const { messages, model, temperature } = requestData;

      if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("Missing or invalid messages array in request");
      }

      const selectedModel = model || "google/gemini-2.5-flash-lite";

      const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://jobtiered.com",
          "X-Title": "JobTiered"
        },
        body: JSON.stringify({
          model: selectedModel,
          messages,
          temperature: temperature ?? 0.1
        })
      });

      const aiTextData = await openRouterResponse.text();
      let aiData;
      try {
        aiData = JSON.parse(aiTextData);
      } catch {
        throw new Error(`OpenRouter returned invalid JSON: ${aiTextData.substring(0, 200)}`);
      }

      if (aiData.error) {
        const errMsg = typeof aiData.error === 'string'
          ? aiData.error
          : aiData.error.message || JSON.stringify(aiData.error);
        return new Response(JSON.stringify({ error: `OpenRouter Error: ${errMsg}` }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!aiData.choices || !aiData.choices[0]) {
        throw new Error("Unexpected response structure from OpenRouter");
      }

      const newRemaining = remaining - 1;
      await supabaseAdmin
        .from('freemium_grades')
        .update({ remaining: newRemaining })
        .eq('user_id', user.id);

      aiData._freemium = { remaining: newRemaining };

      return new Response(JSON.stringify(aiData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { messages, model, temperature } = requestData;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("Missing or invalid messages array in request");
    }

    const selectedModel = model || "google/gemini-2.5-flash-lite";

    const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://jobtiered.com",
        "X-Title": "JobTiered"
      },
      body: JSON.stringify({
        model: selectedModel,
        messages,
        temperature: temperature ?? 0.1
      })
    });

    const aiTextData = await openRouterResponse.text();
    let aiData;

    try {
      aiData = JSON.parse(aiTextData);
    } catch {
      throw new Error(`OpenRouter returned invalid JSON: ${aiTextData.substring(0, 200)}`);
    }

    if (aiData.error) {
      const errMsg = typeof aiData.error === 'string'
        ? aiData.error
        : aiData.error.message || JSON.stringify(aiData.error);
      return new Response(JSON.stringify({ error: `OpenRouter Error: ${errMsg}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!aiData.choices || !aiData.choices[0]) {
      throw new Error("Unexpected response structure from OpenRouter");
    }

    return new Response(JSON.stringify(aiData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function getOrCreateFreemiumRecord(supabaseAdmin: any, userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('freemium_grades')
    .select('remaining')
    .eq('user_id', userId)
    .single();

  if (data && !error) {
    return data.remaining;
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('freemium_grades')
    .upsert({ user_id: userId, remaining: FREEMIUM_LIMIT }, { onConflict: 'user_id' })
    .select('remaining')
    .single();

  if (insertError) {
    console.error(`Failed to create freemium record: ${insertError.message}`);
    return 0;
  }

  return inserted?.remaining ?? FREEMIUM_LIMIT;
}
