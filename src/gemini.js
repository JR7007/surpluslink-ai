// Gemini integration — calls our own server-side proxy, which holds the real API key.
const today = () => new Date().toISOString().slice(0, 10);

async function call(prompt, images = [], json = true) {
  const parts = [{ text: prompt }];
  images.filter(Boolean).forEach((i) => {
    const [h, d] = i.split(",");
    parts.push({ inline_data: { mime_type: h.match(/:(.*?);/)[1], data: d } });
  });

  const r = await fetch("/api/gemini", {
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
