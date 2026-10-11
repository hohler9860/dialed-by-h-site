-- Unboxing videos on deals (due diligence).
-- Every incoming piece gets filmed coming out of the dealer's box. The video is
-- compressed in the browser before upload (see admin/index.html, bkUploadUnboxing)
-- and lands in the same private dbh-docs bucket as contracts, as kind 'unboxing'.

alter table public.dbh_deal_docs drop constraint dbh_deal_docs_kind_check;
alter table public.dbh_deal_docs add constraint dbh_deal_docs_kind_check
    check (kind = any (array['contract', 'invoice', 'statement', 'unboxing', 'other']));

-- 15MB was sized for PDFs. A compressed 1080p unboxing runs ~27MB a minute, and
-- the "upload the original" fallback can be bigger still, so 500MB.
update storage.buckets
   set file_size_limit = 524288000,
       allowed_mime_types = array[
           'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'text/csv',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/msword',
           'video/mp4', 'video/quicktime'
       ]
 where id = 'dbh-docs';
