import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import Stripe from "npm:stripe@latest"

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

serve(async (req) => {
  const signature = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const body = await req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret!, undefined, cryptoProvider);
    console.log(`Webhook received: ${event.type}`);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id; 
      
      console.log(`Checkout completed for user_id: ${userId}`);
      
      if (!userId) {
        console.error("No client_reference_id found. Skipping database insert.");
        return new Response(JSON.stringify({ received: true, note: "No user ID" }), { status: 200 });
      }

      const sessionWithLineItems = await stripe.checkout.sessions.retrieve(
        session.id,
        { expand: ['line_items'] }
      );
      const priceId = sessionWithLineItems.line_items?.data[0]?.price?.id || 'unknown';
      const isLifetime = session.mode === 'payment';

      console.log(`Inserting into database: status=${isLifetime ? 'lifetime' : 'active'}`);

      const { error } = await supabase.from('subscriptions').upsert({
        user_id: userId,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription || null,
        status: isLifetime ? 'lifetime' : 'active',
        price_id: priceId
      }, { onConflict: 'user_id' });

      if (error) {
        console.error(`Supabase Insert Error:`, error.message);
        throw error;
      }
      
      console.log("Database successfully updated.");
    } else if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      
      const { error } = await supabase.from('subscriptions').update({
        status: subscription.status,
        price_id: subscription.items.data[0].price.id,
      }).eq('stripe_subscription_id', subscription.id);

      if (error) {
        console.error(`Supabase Update Error:`, error.message);
        throw error;
      }
      console.log(`Subscription updated to status: ${subscription.status}`);
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error(`Function Error:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
})
