const React = require("react");
const { Html, Text } = require("@react-email/components");

const {
  BRAND, FONT, C,
  row, divider, spacer, emailHead, emailShell, logoRow,
  ctaButton, signoff, socialIcons, footer,
  headerBlock, fullBleedImage,
} = require("./welcome.js");

// ── Broadcast Email ──────────────────────────────────────────
// imageUrl renders as a full-bleed photo under the header, same treatment as
// the welcome hero — journal broadcasts pass the article's hero image here.
// No image supplied = sticker-only, which is still the default for manual sends.

function BroadcastEmail({
  previewText = "New from Dialed By H",
  tag = "NEW ARRIVAL",
  headline = "Something Special Just Landed",
  body = "",
  body2 = "",
  imageUrl = "",
  imageAlt = "",
  useRandomImage = false, // ignored — kept so older callers don't break
  details = [],
  ctaText = "View Now",
  ctaUrl = "",
  signoffText = "Talk soon,",
}) {
  const finalCtaUrl = ctaUrl || `${BRAND.siteUrl}/inventory.html`;

  const detailRows = details
    .filter(d => d && d.value)
    .map((d, i, arr) =>
      React.createElement("tr", { key: i },
        React.createElement("td", {
          className: "detail-label detail-border",
          style: {
            color: C.muted, fontSize: "10px", fontWeight: "700",
            fontFamily: FONT.mono, letterSpacing: "2.5px", textTransform: "uppercase",
            padding: "13px 0", verticalAlign: "top",
            borderBottom: i < arr.length - 1 ? `1px solid ${C.divider}` : "none",
          },
        }, d.label),
        React.createElement("td", {
          className: "detail-value detail-border",
          style: {
            color: C.heading, fontSize: "14px", fontFamily: FONT.body, fontWeight: "700",
            padding: "13px 0 13px 16px", textAlign: "right", verticalAlign: "top",
            borderBottom: i < arr.length - 1 ? `1px solid ${C.divider}` : "none",
          },
        }, d.value)
      )
    );

  return React.createElement(
    Html, { lang: "en" },
    ...emailHead(previewText),
    emailShell([
      spacer("44px"),
      logoRow(),
      divider(),

      row(C.card, "38px 48px 24px", "left", [
        // Pinned sticker: steel blue dial. The seed-picked rotation kept
        // landing on gold pieces, which are off-brand.
        React.createElement("div", { key: "hdr" }, headerBlock(tag, headline, headline, `${BRAND.siteUrl}/images/email/sticker-7.png`)),
        body ? React.createElement(Text, {
          key: "b1", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 16px", fontFamily: FONT.body },
        }, body) : null,
        body2 ? React.createElement(Text, {
          key: "b2", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0", fontFamily: FONT.body },
        }, body2) : null,
      ]),

      // Full-bleed hero photo (journal hero image, arrival shot, etc.)
      ...(imageUrl ? [
        fullBleedImage(imageUrl, imageAlt, ctaUrl || finalCtaUrl),
        spacer("24px"),
      ] : []),

      // Spec table before the CTA: give the reader the facts, then one action
      ...(detailRows.length > 0 ? [
        row(C.card, "0 48px 8px", "left",
          React.createElement("table", {
            role: "presentation", width: "100%",
            cellPadding: "0", cellSpacing: "0", border: "0",
            style: { borderCollapse: "collapse" },
          },
            React.createElement("tbody", null, ...detailRows)
          )
        ),
        spacer("10px"),
      ] : []),

      ctaButton(ctaText, finalCtaUrl, "animate-slide animate-delay-1"),

      spacer("34px"),
      divider(),

      signoff(signoffText),
      socialIcons(),
      footer(),
      spacer("40px"),
    ])
  );
}

module.exports = { BroadcastEmail };
