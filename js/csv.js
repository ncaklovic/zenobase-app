// Minimal RFC4180 CSV parser. Used for data/podcasts_full.csv (a manual
// export from a podcast app), which - unlike the other read-only sources -
// isn't converted to JSON before landing in the data repo, so this app has
// to parse it directly. Field values can contain quoted commas (podcast/
// episode names routinely do), so a naive split(",") isn't safe here.

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const header = rows[0];
  return rows
    .slice(1)
    .filter((r) => !(r.length === 1 && r[0] === ""))
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => {
        obj[h] = r[idx] ?? "";
      });
      return obj;
    });
}
