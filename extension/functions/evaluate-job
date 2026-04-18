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

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { data: subData, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .single();

    if (subError || (subData?.status !== 'active' && subData?.status !== 'lifetime')) {
      return new Response(JSON.stringify({ error: 'Active or lifetime subscription required' }), { 
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const bodyText = await req.text();
    let requestData;
    try {
      requestData = JSON.parse(bodyText);
    } catch (e) {
      throw new Error("Invalid request data sent from extension");
    }

    const { jobDescription, resumeText, model } = requestData;
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
        messages:[
          { role: "system", content: "You are an expert technical recruiter evaluating a job fit. Score this job against the resume on a scale of 1-100." },
          { role: "user", content: `Resume: ${resumeText}\n\nJob Description: ${jobDescription}` }
        ]
      })
    });

    const aiTextData = await openRouterResponse.text();
    let aiData;
    
    try {
      aiData = JSON.parse(aiTextData);
    } catch (e) {
      throw new Error(`OpenRouter API returned an invalid format. Raw response: ${aiTextData.substring(0, 100)}...`);
    }

    if (aiData.error) {
       return new Response(JSON.stringify({ error: `OpenRouter Error: ${aiData.error.message}` }), {
         status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
       });
    }

    if (!aiData.choices || !aiData.choices[0]) {
       throw new Error("Unexpected response structure from OpenRouter.");
    }

    return new Response(JSON.stringify({ result: aiData.choices[0].message.content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
