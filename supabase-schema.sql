-- Run this in your Supabase SQL Editor (supabase.com → your project → SQL Editor)

CREATE TABLE submissions (
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

CREATE INDEX idx_submissions_created_at ON submissions(created_at DESC);
CREATE INDEX idx_submissions_type ON submissions(submission_type);
CREATE INDEX idx_submissions_email ON submissions(email);
