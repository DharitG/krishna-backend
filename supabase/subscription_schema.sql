-- Subscription Tables for RevenueCat Integration

-- Table for storing subscription plans
CREATE TABLE public.subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_usd DECIMAL(10, 2) NOT NULL,
  billing_period TEXT NOT NULL, -- 'monthly', 'yearly'
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for storing user subscriptions
CREATE TABLE public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  plan_id TEXT REFERENCES public.subscription_plans(id),
  revenuecat_customer_id TEXT,
  revenuecat_entitlement_id TEXT,
  status TEXT NOT NULL, -- 'active', 'cancelled', 'expired'
  platform TEXT, -- 'ios', 'android', 'web'
  original_purchase_date TIMESTAMP WITH TIME ZONE,
  expires_date TIMESTAMP WITH TIME ZONE,
  renewal_date TIMESTAMP WITH TIME ZONE,
  is_trial BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Table for storing purchase history
CREATE TABLE public.purchase_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  subscription_id UUID REFERENCES public.user_subscriptions(id),
  transaction_id TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'ios', 'android', 'web'
  product_id TEXT NOT NULL,
  purchase_date TIMESTAMP WITH TIME ZONE NOT NULL,
  amount_usd DECIMAL(10, 2) NOT NULL,
  receipt_data TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add subscription_status to profiles table
ALTER TABLE public.profiles 
ADD COLUMN subscription_status TEXT DEFAULT 'free';

-- Add function to update user profile when subscription changes
CREATE OR REPLACE FUNCTION public.update_profile_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET subscription_status = NEW.status,
      updated_at = now()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update profile when subscription status changes
CREATE TRIGGER on_subscription_status_change
  AFTER INSERT OR UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_profile_subscription_status();

-- Insert initial subscription plans
INSERT INTO public.subscription_plans (id, name, description, price_usd, billing_period, features)
VALUES 
  ('eden_monthly', 'Eden', 'Perfect for personal use with essential features', 20.00, 'monthly', 
   '[
     "10x more requests than free plan",
     "SOTA AI models with significantly higher accuracy than free",
     "Manage 10x more accounts than free",
     "Standard response time"
   ]'::jsonb),
  ('utopia_monthly', 'Utopia', 'Advanced features for professionals', 50.00, 'monthly', 
   '[
     "Unlimited requests",
     "SOTA AI models with significantly higher accuracy than free",
     "Unlimited accounts",
     "File uploads & analysis",
     "Priority response time",
     "Enhanced security features"
   ]'::jsonb);

-- Set up Row Level Security (RLS)
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_history ENABLE ROW LEVEL SECURITY;

-- Everyone can view subscription plans
CREATE POLICY "Anyone can view subscription plans" ON public.subscription_plans
  FOR SELECT USING (true);

-- Users can only view their own subscriptions
CREATE POLICY "Users can view their own subscriptions" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Admin can manage subscriptions (you'd need to define an admin role)
CREATE POLICY "Admin can manage all subscriptions" ON public.user_subscriptions
  FOR ALL USING (auth.role() = 'admin');

-- Users can view their own purchase history
CREATE POLICY "Users can view their own purchase history" ON public.purchase_history
  FOR SELECT USING (auth.uid() = user_id);

-- Admin can view all purchase history
CREATE POLICY "Admin can view all purchase history" ON public.purchase_history
  FOR SELECT USING (auth.role() = 'admin');