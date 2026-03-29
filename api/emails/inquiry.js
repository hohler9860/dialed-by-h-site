const React = require("react");
const { Html, Text, Img } = require("@react-email/components");

const {
  BRAND, FONT, C,
  row, divider, spacer, emailHead, emailShell, logoRow,
  ctaButton, signoff, socialIcons, footer, featureItem,
} = require("./welcome.js");

// ── Inquiry Confirmation Email ───────────────────────────────

function InquiryEmail({ firstName, watchName, watchRef, watchBrand, watchImage }) {
  const greeting = firstName ? `${firstName},` : "Hello,";
  const piece = watchName || "a timepiece";
  const previewText = `I\u2019m on it -your inquiry for ${piece}.`;

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
          fontFamily: FONT.heading, letterSpacing: "2.5px", textTransform: "uppercase",
          padding: "12px 0", verticalAlign: "top",
          borderBottom: i < arr.length - 1 ? `1px solid ${C.divider}` : "none",
        },
      }, d.label),
      React.createElement("td", {
        className: "detail-value detail-border",
        style: {
          color: "#333333", fontSize: "14px", fontFamily: FONT.body, fontWeight: "500",
          padding: "12px 0 12px 16px", textAlign: "right", verticalAlign: "top",
          borderBottom: i < arr.length - 1 ? `1px solid ${C.divider}` : "none",
        },
      }, d.value)
    )
  );

  return React.createElement(
    Html, { lang: "en" },
    ...emailHead(previewText),
    emailShell([
      // Top spacer
      spacer("48px"),

      // Logo
      logoRow(),

      // Divider
      divider(),

      // Tag + Greeting + Body
      row(C.card, "40px 48px 28px", "left", [
        React.createElement(Text, {
          key: "tag", className: "tag-text",
          style: { color: C.tag, fontSize: "10px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "4px", textTransform: "uppercase", margin: "0 0 20px" },
        }, "Inquiry Received"),
        React.createElement(Text, {
          key: "greet", className: "heading-text heading-main animate-slide",
          style: { color: C.heading, fontSize: "30px", fontWeight: "700", letterSpacing: "-0.5px", lineHeight: "1.2", margin: "0 0 28px", fontFamily: FONT.heading },
        }, greeting),
        React.createElement(Text, {
          key: "b1", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0 0 18px", fontFamily: FONT.body },
        }, `Thank you for your interest in the ${piece}. I\u2019m personally reviewing availability, condition, and pricing now.`),
        React.createElement(Text, {
          key: "b2", className: "body-text body-main",
          style: { color: C.body, fontSize: "15px", lineHeight: "1.75", margin: "0", fontFamily: FONT.body },
        }, "Expect to hear from me within 24 hours. In the meantime, here\u2019s a summary of your inquiry."),
      ]),

      // CTA — above the fold, before image
      ctaButton("Browse More Pieces", `${BRAND.siteUrl}/inventory.html`, "animate-slide animate-delay-1"),

      // Watch image (if provided) — fluid
      ...(watchImage ? [
        React.createElement("tr", { key: "watch-img" },
          React.createElement("td", {
            bgcolor: C.card, className: "email-bg",
            style: { backgroundColor: C.card, padding: "32px 0 0 0" },
          },
            React.createElement(Img, {
              src: watchImage, alt: watchName || "Watch",
              width: "600",
              className: "hero-img animate-fade animate-delay-2",
              style: { display: "block", width: "100%", maxWidth: "600px", height: "auto", outline: "none", border: "none" },
            })
          )
        ),
      ] : []),

      // Detail table
      ...(detailRows.length > 0 ? [
        row(C.card, "24px 48px 8px", "left",
          React.createElement("table", {
            role: "presentation", width: "100%",
            cellPadding: "0", cellSpacing: "0", border: "0",
            style: { borderCollapse: "collapse" },
          },
            React.createElement("tbody", null, ...detailRows)
          )
        ),
      ] : []),

      // Spacer
      spacer("16px"),

      // Divider
      divider(),

      // What Happens Next heading
      row(C.card, "36px 48px 8px", "left",
        React.createElement(Text, {
          className: "heading-text",
          style: { color: C.heading, fontSize: "10px", fontWeight: "700", fontFamily: FONT.heading, letterSpacing: "4px", textTransform: "uppercase", margin: "0 0 24px" },
        }, "What Happens Next")
      ),

      // Steps
      row(C.card, "0 48px 28px", "left", [
        React.createElement("div", { key: "s1", className: "animate-slide animate-delay-1" },
          featureItem("01", "Sourcing & Verification", "I\u2019ll check current market availability and verify condition details with my sources.")),
        React.createElement("div", { key: "s2", className: "animate-slide animate-delay-2" },
          featureItem("02", "Personal Outreach", "You\u2019ll hear from me directly -by email or WhatsApp -within 24 hours.")),
        React.createElement("div", { key: "s3", className: "animate-slide animate-delay-3" },
          featureItem("03", "Secure Delivery", "Once confirmed, I handle authentication, documentation, and insured shipping door to door.")),
      ]),

      // Divider
      divider(),

      // Sign-off
      signoff(),

      // Social icons
      socialIcons(),

      // Footer
      footer(),

      // Bottom spacer
      spacer("40px"),
    ])
  );
}

module.exports = { InquiryEmail };
