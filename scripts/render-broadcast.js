#!/usr/bin/env node
/**
 * Renders a broadcast email to HTML that you can paste into Resend's dashboard.
 *
 * Usage:
 *   node scripts/render-broadcast.js                    # renders with example data, opens in browser
 *   node scripts/render-broadcast.js --type arrival     # new arrival example
 *   node scripts/render-broadcast.js --type journal     # journal post example
 *   node scripts/render-broadcast.js --type announcement # announcement example
 *   node scripts/render-broadcast.js --json config.json  # render from a JSON config file
 *
 * The rendered HTML is saved to broadcast-output.html and copied to clipboard (macOS).
 */

const React = require("react");
const { render } = require("@react-email/render");
const { BroadcastEmail } = require("../netlify/functions/emails/broadcast.js");
const fs = require("fs");
const { execSync } = require("child_process");

const examples = {
  arrival: {
    previewText: "A Patek Philippe Nautilus just landed. Private list gets first access.",
    tag: "NEW ARRIVAL",
    headline: "Patek Philippe Nautilus 5711/1A",
    body: "A pristine example of one of the most coveted references in modern watchmaking just became available through my network. Full set, 2022 papers, unworn condition.",
    body2: "This piece won\u2019t last. If you\u2019ve been waiting for the right 5711, this is it.",
    imageUrl: "https://dialedbyhenry.com/images/5811.jpg.webp",
    imageAlt: "Patek Philippe Nautilus 5711/1A",
    imageDark: true,
    details: [
      { label: "Brand", value: "Patek Philippe" },
      { label: "Model", value: "Nautilus" },
      { label: "Reference", value: "Ref. 5711/1A-010" },
      { label: "Condition", value: "Unworn" },
      { label: "Set", value: "Full Set" },
    ],
    ctaText: "Inquire Now",
    ctaUrl: "https://dialedbyhenry.com/inventory.html",
  },
  journal: {
    previewText: "New on the journal: Why the Royal Oak is the ultimate daily wear.",
    tag: "JOURNAL",
    headline: "Why the Royal Oak Is Still King",
    body: "I just published a deep dive into what makes the Audemars Piguet Royal Oak the most versatile luxury sport watch ever made.",
    body2: "Whether you own one or aspire to, this is worth the read.",
    imageUrl: "https://dialedbyhenry.com/images/buy-ap-royal-oak.jpg",
    imageAlt: "Audemars Piguet Royal Oak",
    imageDark: false,
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
    signoff: "More to come,",
  },
};

async function main() {
  const args = process.argv.slice(2);
  let props;

  if (args.includes("--json")) {
    const jsonPath = args[args.indexOf("--json") + 1];
    props = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    console.log("Loaded config from:", jsonPath);
  } else if (args.includes("--type")) {
    const type = args[args.indexOf("--type") + 1];
    props = examples[type];
    if (!props) {
      console.error("Unknown type. Use: arrival, journal, or announcement");
      process.exit(1);
    }
    console.log("Using example:", type);
  } else {
    props = examples.arrival;
    console.log("Using default example (arrival). Use --type or --json for others.");
  }

  const html = await render(React.createElement(BroadcastEmail, props));
  const outPath = "broadcast-output.html";
  fs.writeFileSync(outPath, html);
  console.log(`Saved to ${outPath} (${html.length} bytes)`);

  // Copy to clipboard on macOS
  try {
    execSync(`echo '${html.replace(/'/g, "'\\''")}' | pbcopy`, { stdio: "pipe" });
    console.log("Copied HTML to clipboard — paste into Resend dashboard");
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
