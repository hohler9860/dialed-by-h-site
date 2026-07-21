const React = require("react");
const { Html, Text } = require("@react-email/components");

const {
  BRAND, FONT, C,
  row, divider, spacer, emailHead, emailShell, logoRow,
  ctaButton, signoff, socialIcons, footer, featureItem,
  headerBlock, panelSection, panelLabel,
} = require("./welcome.js");

// ── Inquiry Confirmation Email ───────────────────────────────
// No photos by design: the sticker in the header is the only imagery, so the
// email renders instantly, never trips image proxies, and survives dark mode.

function InquiryEmail({ firstName, watchName, watchRef, watchBrand }) {
  const piece = watchName || "a timepiece";
  const previewText = `I’m on it. Your request for ${piece}.`;

  const detailData = [];
  if (watchBrand) detailData.push({ label: "Brand", value: watchBrand });
  if (watchName) detailData.push({ label: "Model", value: watchName });
  if (watchRef) detailData.push({ label: "Reference", value: `Ref. ${watchRef}` });

  const detailRows = detailData.map((d, i, arr) =>
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
        // Pinned sticker: the white moonphase on leather (quiet, concierge
        // energy). The seed-picked rotation kept landing on gold pieces.
        React.createElement("div", { key: "hdr" }, headerBlock("Request received", "On it.", piece, `${BRAND.siteUrl}/images/email/sticker-5.png`)),
        React.createElement(Text, {
          key: "b1", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 16px", fontFamily: FONT.body },
        }, `${firstName ? firstName + ", thanks" : "Thanks"} for your interest in the ${piece}. I’m personally checking availability, condition, and pricing right now.`),
        React.createElement(Text, {
          key: "b2", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0", fontFamily: FONT.body },
        }, "You’ll hear from me within 24 hours. Want an answer faster? Text me directly."),
      ]),

      ctaButton("Text Me on WhatsApp", BRAND.whatsapp, "animate-slide animate-delay-1"),

      // Request summary — bordered panel
      ...(detailRows.length > 0 ? [
        spacer("34px"),
        panelSection([
          panelLabel("Your Request"),
          React.createElement("table", {
            key: "tbl",
            role: "presentation", width: "100%",
            cellPadding: "0", cellSpacing: "0", border: "0",
            style: { borderCollapse: "collapse" },
          },
            React.createElement("tbody", null, ...detailRows)
          ),
        ], "32px 48px"),
      ] : []),

      spacer("28px"),

      // Next steps — bordered panel
      panelSection([
        panelLabel("What Happens Next"),
        React.createElement("div", { key: "s1", className: "animate-slide animate-delay-1" },
          featureItem("01", "Sourcing & Verification", "I check live market availability and verify condition with my sources.")),
        React.createElement("div", { key: "s2", className: "animate-slide animate-delay-2" },
          featureItem("02", "Personal Outreach", "You hear from me directly, by email or WhatsApp, within 24 hours.")),
        React.createElement("div", { key: "s3", className: "animate-slide animate-delay-3" },
          featureItem("03", "Secure Delivery", "Authentication, documentation, and insured shipping, door to door.")),
      ], "32px 48px 16px"),

      signoff(),
      socialIcons(),
      footer(),
      spacer("40px"),
    ])
  );
}

module.exports = { InquiryEmail };
