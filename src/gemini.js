// Gemini integration. NOTE: the key is exposed in the browser — fine for a hackathon demo, proxy it for production.
const KEY = import.meta.env.VITE_GEMINI_API_KEY,
  MODEL = "gemini-3.8-flash";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
const today = () => new Date().toISOString().slice(0, 10);
async function call(prompt, images = [], json = true) {
  if (!KEY) throw new Error("Missing VITE_GEMINI_API_KEY");
  const parts = [{ text: prompt }];
  images.filter(Boolean).forEach((i) => {
    const [h, d] = i.split(",");
    parts.push({ inline_data: { mime_type: h.match(/:(.*?);/)[1], data: d } });
  });
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: json ? { responseMimeType: "application/json" } : {},
    }),
  });
  const j = await r.json(),
    t = j.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!t) throw new Error(j.error?.message || "Gemini returned nothing");
  return json ? JSON.parse(t) : t;
}
export const aiQuickFill = (text, img) =>
  call(
    `Today is ${today()}. Read the seller's messy note and product photo and return a surplus listing as JSON with keys: product_name, category (Dry Goods|Baking|Dairy & Chilled|Beverages|Frozen), total_quantity (number), unit (kg|g|L|ml|packs|cartons), expiry_date (YYYY-MM-DD, null if unknown), original_unit_price (number in RM, null if unknown), storage_type (Dry / Room Temp|Chilled|Frozen), packaging_status (Unopened / Factory Sealed|Opened), date_type (Best Before|Use By (Expiry)). Use null when unsure; never invent. Note: "${text || "(none)"}"`,
    [img],
  );
export const aiReadExpiry = (img) =>
  call(
    `You are an AI vision inspector. Read the printed expiry / best-before date on this label or supplier invoice. Reply JSON {"date":"YYYY-MM-DD" or null if unreadable,"confidence":0-1}. Today is ${today()}.`,
    [img],
  );
export const aiPriceReason = (x) =>
  call(
    `Malaysian food-surplus price advisor. Product: ${x.product_name}, original RM${x.original_unit_price}/${x.unit}, ${x.days} days left, suggested price RM${x.sp}/${x.unit} (already computed — do not change it). Reply JSON {"reason":"one plain-English sentence explaining why this price is fair and beats retail","retail_price":number estimated typical Malaysian retail RM per ${x.unit}}.`,
  );
export const aiMatch = (l, c) =>
  call(
    `Rank buyers for this surplus listing: ${l.product_name} ${l.total_quantity}${l.unit} in ${l.sellerArea}. Candidates (with preliminary score): ${JSON.stringify(c)}. Return a JSON array of {"uid","score"(0-100 integer),"reason"(max 22 words, mention distance, menu and wanted quantity if relevant)} for every candidate, best first.`,
  );
export const aiSummarise = (msgs, listing) =>
  call(
    `Read this buyer/seller chat about ${listing.product_name} (available ${listing.available_quantity}${listing.unit}, asking RM${listing.asking_unit_price}). Return JSON {"agreed_quantity":number|null,"agreed_unit_price":number|null,"fulfilment_method":"Self-Pickup"|"Lalamove / GrabExpress"|"Seller Delivery"|null}. Use only what both sides agreed.\n\n${msgs.map((m) => `${m.name}: ${m.text || "[photo]"}`).join("\n")}`,
  );
export const aiDispute = (l, d) =>
  call(
    `You are a neutral dispute assistant. Image 1 is the seller's original expiry proof. Later images are the buyer's evidence. Listing declared expiry ${l.expiry_date} for ${l.product_name}. Buyer reason: ${d.dispute_reason}. Details: "${d.dispute_details}". Requested outcome: ${d.requested_outcome}. Write a neutral 3-sentence summary: what was declared, what the evidence shows, and any discrepancy. Do NOT give a verdict.`,
    [l.expiry_proof_img, ...(d.evidence_photos || [])],
    false,
  );
