#!/usr/bin/env node
/**
 * Renders email templates to HTML for preview and testing.
 *
 * Usage:
 *   node scripts/render-broadcast.js                        # broadcast: new arrival example
 *   node scripts/render-broadcast.js --type arrival         # broadcast: new arrival
 *   node scripts/render-broadcast.js --type journal         # broadcast: journal post
 *   node scripts/render-broadcast.js --type announcement    # broadcast: announcement
 *   node scripts/render-broadcast.js --template welcome     # welcome email
 *   node scripts/render-broadcast.js --template inquiry     # inquiry confirmation
 *   node scripts/render-broadcast.js --json config.json     # broadcast from JSON config
 *
 * The rendered HTML is saved to broadcast-output.html and copied to clipboard (macOS).
 */

const React = require("react");
const { render } = require("@react-email/render");
const { BroadcastEmail } = require("../api/emails/broadcast.js");
const { WelcomeEmail } = require("../api/emails/welcome.js");
const { InquiryEmail } = require("../api/emails/inquiry.js");
const fs = require("fs");
const { execSync } = require("child_process");

const examples = {
  arrival: {
    previewText: "A Patek Philippe Nautilus just landed. Private list gets first access.",
    tag: "NEW ARRIVAL",
    headline: "Patek Philippe Nautilus 5711/1A",
    body: "A pristine example of one of the most coveted references in modern watchmaking just became available through my network. Full set, 2022 papers, unworn condition.",
    body2: "This piece won\u2019t last. If you\u2019ve been waiting for the right 5711, this is it.",
    imageUrl: "https://www.dialedbyhenry.com/images/patek-aquanaut.jpg",
    imageAlt: "Patek Philippe Nautilus 5711/1A",
    details: [
      { label: "Brand", value: "Patek Philippe" },
      { label: "Model", value: "Nautilus" },
      { label: "Reference", value: "Ref. 5711/1A-010" },
      { label: "Condition", value: "Unworn" },
      { label: "Set", value: "Full Set" },
    ],
    ctaText: "Inquire Now",
    ctaUrl: "https://www.dialedbyhenry.com/inventory.html",
  },
  journal: {
    previewText: "New on the journal: Why the Royal Oak is the ultimate daily wear.",
    tag: "JOURNAL",
    headline: "Why the Royal Oak Is Still King",
    body: "I just published a deep dive into what makes the Audemars Piguet Royal Oak the most versatile luxury sport watch ever made.",
    body2: "Whether you own one or aspire to, this is worth the read.",
    imageUrl: "https://www.dialedbyhenry.com/images/buy-ap-royal-oak.jpg",
    imageAlt: "Audemars Piguet Royal Oak",
    ctaText: "Read the Article",
    ctaUrl: "https://dialedbyh.substack.com",
  },
  announcement: {
    previewText: "Big things coming to Dialed By H this month.",
    tag: "ANNOUNCEMENT",
    headline: "Expanding the Collection",
    body: "I\u2019m adding Cartier, A. Lange, and F.P. Journe to the sourcing portfolio this month. If any of these brands have been on your radar, now is the time to reach out.",
    ctaText: "Get in Touch",
    ctaUrl: "https://wa.me/19146211848",
    signoffText: "More to come,",
    useRandomImage: true,
  },
};

async function main() {
  const args = process.argv.slice(2);
  let element;
  let label;

  if (args.includes("--template")) {
    const tmpl = args[args.indexOf("--template") + 1];
    if (tmpl === "welcome") {
      element = React.createElement(WelcomeEmail, { firstName: "Henry" });
      label = "welcome";
    } else if (tmpl === "inquiry") {
      element = React.createElement(InquiryEmail, {
        firstName: "Alex",
        watchName: "Royal Oak 15500ST",
        watchRef: "15500ST.OO.1220ST.01",
        watchBrand: "Audemars Piguet",
        watchImage: "https://www.dialedbyhenry.com/images/buy-ap-royal-oak.jpg",
      });
      label = "inquiry";
    } else {
      console.error("Unknown template. Use: welcome or inquiry");
      process.exit(1);
    }
    console.log(`Rendering ${label} email...`);
  } else if (args.includes("--json")) {
    const jsonPath = args[args.indexOf("--json") + 1];
    const props = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    element = React.createElement(BroadcastEmail, props);
    label = "broadcast (from JSON)";
    console.log("Loaded config from:", jsonPath);
  } else {
    const type = args.includes("--type") ? args[args.indexOf("--type") + 1] : "arrival";
    const props = examples[type];
    if (!props) {
      console.error("Unknown type. Use: arrival, journal, or announcement");
      process.exit(1);
    }
    element = React.createElement(BroadcastEmail, props);
    label = `broadcast (${type})`;
    console.log("Using example:", type);
  }

  const html = await render(element);
  const outPath = "broadcast-output.html";
  fs.writeFileSync(outPath, html);
  console.log(`Saved ${label} to ${outPath} (${html.length} bytes)`);

  // Copy to clipboard on macOS
  try {
    execSync(`echo '${html.replace(/'/g, "'\\''")}' | pbcopy`, { stdio: "pipe" });
    console.log("Copied HTML to clipboard");
  } catch {
    console.log("Could not copy to clipboard. Open the HTML file manually.");
  }

  // Open in browser
  try {
    execSync(`open ${outPath}`, { stdio: "pipe" });
  } catch {
    // not macOS
  }
}

main().catch(console.error);
