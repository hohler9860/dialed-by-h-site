-- Run this in your Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- This file documents the current state. Applied migrations live in Supabase.

-- ============================================================================
-- SUBMISSIONS (legacy + active)
-- ============================================================================

CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    submission_type TEXT NOT NULL,
    full_name TEXT,
    email TEXT NOT NULL,
    watch_name TEXT,
    watch_ref TEXT,
    watch_details TEXT,
    status TEXT DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_type ON submissions(submission_type);
CREATE INDEX IF NOT EXISTS idx_submissions_email ON submissions(email);

-- Active form-submissions table (used by /api/submit-form.js)
-- Same columns as `submissions`; this is the production table

-- ============================================================================
-- OFF-CATALOG JOURNAL
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.journal_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    excerpt TEXT,
    hero_image_url TEXT,
    content_html TEXT NOT NULL DEFAULT '',
    content_json JSONB,
    category TEXT,
    author_name TEXT DEFAULT 'Henry Ohler',
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    seo_title TEXT,
    seo_description TEXT,
    reading_time_minutes INT,
    view_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_journal_articles_slug ON public.journal_articles(slug);
CREATE INDEX IF NOT EXISTS idx_journal_articles_status_published ON public.journal_articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_articles_category ON public.journal_articles(category) WHERE category IS NOT NULL;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.update_journal_articles_updated_at()
RETURNS TRIGGER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_articles_updated_at ON public.journal_articles;
CREATE TRIGGER trg_journal_articles_updated_at
    BEFORE UPDATE ON public.journal_articles
    FOR EACH ROW EXECUTE FUNCTION public.update_journal_articles_updated_at();

-- Subscribers: double opt-in via Resend
CREATE TABLE IF NOT EXISTS public.journal_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    confirmed BOOLEAN DEFAULT false,
    confirmation_token TEXT UNIQUE,
    confirmed_at TIMESTAMPTZ,
    unsubscribe_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
    unsubscribed_at TIMESTAMPTZ,
    source TEXT DEFAULT 'journal',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_subscribers_email ON public.journal_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_journal_subscribers_confirmed ON public.journal_subscribers(confirmed) WHERE confirmed = true;
CREATE INDEX IF NOT EXISTS idx_journal_subscribers_confirmation_token ON public.journal_subscribers(confirmation_token) WHERE confirmation_token IS NOT NULL;

-- RLS
ALTER TABLE public.journal_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_subscribers ENABLE ROW LEVEL SECURITY;

-- Public reads published articles only; writes go through service role
DROP POLICY IF EXISTS "Public can read published articles" ON public.journal_articles;
CREATE POLICY "Public can read published articles"
    ON public.journal_articles
    FOR SELECT
    TO anon, authenticated
    USING (status = 'published');

-- journal_subscribers: service role only (no anon policies)
-- All subscribe / confirm / unsubscribe flows go through server-side API

-- Storage bucket: journal-images (public bucket, 10MB limit, image MIME types only)
-- Created via Supabase storage API; no SELECT policy on storage.objects needed
-- (public buckets serve directly via URL)
