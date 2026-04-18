import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
      await supabaseAdmin.from('saved_jobs').delete().eq('user_id', user.id);

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

    if (requestData.action === 'save-job') {
      const job = requestData.job;
      if (!job || !job.title) throw new Error('Missing job data');

      const dedupKey = ((job.url || '') + '|' + job.title).toLowerCase();
      const { data: existing } = await supabaseAdmin
        .from('saved_jobs')
        .select('id')
        .eq('user_id', user.id)
        .eq('dedup_key', dedupKey)
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ job: existing, duplicate: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('saved_jobs')
        .insert({
          user_id: user.id,
          title: (job.title || '').substring(0, 200),
          company: (job.company || '').substring(0, 200),
          location: (job.location || '').substring(0, 200),
          url: (job.url || '').substring(0, 2000),
          tier: (job.tier || '').substring(0, 2),
          pay: (job.pay || '').substring(0, 200),
          market_range: (job.marketRange || '').substring(0, 200),
          fit: (job.fit || '').substring(0, 50),
          description: (job.description || '').substring(0, 4000),
          reasoning: (job.reasoning || '').substring(0, 2000),
          pros: job.pros || [],
          flags: job.flags || [],
          stage: 'saved',
          applied: false,
          dedup_key: dedupKey,
          cover_letter: '',
          tweaked_resume: '',
          interview_questions: ''
        })
        .select()
        .single();

      if (insertErr) throw new Error(`Failed to save job: ${insertErr.message}`);

      return new Response(JSON.stringify({ job: inserted }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (requestData.action === 'get-saved-jobs') {
      const { data: jobs, error: fetchErr } = await supabaseAdmin
        .from('saved_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(200);

      if (fetchErr) throw new Error(`Failed to fetch jobs: ${fetchErr.message}`);

      return new Response(JSON.stringify({ jobs: jobs || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (requestData.action === 'update-job') {
      const { jobId, updates } = requestData;
      if (!jobId) throw new Error('Missing jobId');

      const allowed = ['stage', 'applied', 'cover_letter', 'tweaked_resume', 'interview_questions'];
      const sanitized: Record<string, any> = { updated_at: new Date().toISOString() };
      for (const key of allowed) {
        if (updates[key] !== undefined) sanitized[key] = updates[key];
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('saved_jobs')
        .update(sanitized)
        .eq('id', jobId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateErr) throw new Error(`Failed to update job: ${updateErr.message}`);

      return new Response(JSON.stringify({ job: updated }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (requestData.action === 'delete-job') {
      const { jobId } = requestData;
      if (!jobId) throw new Error('Missing jobId');

      const { error: delErr } = await supabaseAdmin
        .from('saved_jobs')
        .delete()
        .eq('id', jobId)
        .eq('user_id', user.id);

      if (delErr) throw new Error(`Failed to delete job: ${delErr.message}`);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: subData, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .single();

    if (subError || subData?.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Active subscription required. BYOK users must use their own API key.' }), {
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

    return new Response(JSON.stringify(aiData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
