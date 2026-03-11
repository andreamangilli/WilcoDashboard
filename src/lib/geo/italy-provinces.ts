/**
 * Mapping of Italian province names/codes → region names.
 * Covers: Italian names, English names, 2-letter sigla codes.
 * Shopify sends province as full name (Italian or English).
 * Amazon sends StateOrRegion (varies).
 */

export const PROVINCE_TO_REGION: Record<string, string> = {
  // ── Abruzzo ──
  "L'Aquila": "Abruzzo", "AQ": "Abruzzo", "Aquila": "Abruzzo",
  "Chieti": "Abruzzo", "CH": "Abruzzo",
  "Pescara": "Abruzzo", "PE": "Abruzzo",
  "Teramo": "Abruzzo", "TE": "Abruzzo",

  // ── Basilicata ──
  "Matera": "Basilicata", "MT": "Basilicata",
  "Potenza": "Basilicata", "PZ": "Basilicata",

  // ── Calabria ──
  "Catanzaro": "Calabria", "CZ": "Calabria",
  "Cosenza": "Calabria", "CS": "Calabria",
  "Crotone": "Calabria", "KR": "Calabria",
  "Reggio Calabria": "Calabria", "Reggio di Calabria": "Calabria", "RC": "Calabria",
  "Vibo Valentia": "Calabria", "VV": "Calabria",

  // ── Campania ──
  "Avellino": "Campania", "AV": "Campania",
  "Benevento": "Campania", "BN": "Campania",
  "Caserta": "Campania", "CE": "Campania",
  "Napoli": "Campania", "Naples": "Campania", "NA": "Campania",
  "Salerno": "Campania", "SA": "Campania",

  // ── Emilia-Romagna ──
  "Bologna": "Emilia-Romagna", "BO": "Emilia-Romagna",
  "Ferrara": "Emilia-Romagna", "FE": "Emilia-Romagna",
  "Forlì-Cesena": "Emilia-Romagna", "Forli-Cesena": "Emilia-Romagna", "FC": "Emilia-Romagna",
  "Modena": "Emilia-Romagna", "MO": "Emilia-Romagna",
  "Parma": "Emilia-Romagna", "PR": "Emilia-Romagna",
  "Piacenza": "Emilia-Romagna", "PC": "Emilia-Romagna",
  "Ravenna": "Emilia-Romagna", "RA": "Emilia-Romagna",
  "Reggio Emilia": "Emilia-Romagna", "Reggio nell'Emilia": "Emilia-Romagna", "RE": "Emilia-Romagna",
  "Rimini": "Emilia-Romagna", "RN": "Emilia-Romagna",

  // ── Friuli Venezia Giulia ──
  "Gorizia": "Friuli Venezia Giulia", "GO": "Friuli Venezia Giulia",
  "Pordenone": "Friuli Venezia Giulia", "PN": "Friuli Venezia Giulia",
  "Trieste": "Friuli Venezia Giulia", "TS": "Friuli Venezia Giulia",
  "Udine": "Friuli Venezia Giulia", "UD": "Friuli Venezia Giulia",

  // ── Lazio ──
  "Frosinone": "Lazio", "FR": "Lazio",
  "Latina": "Lazio", "LT": "Lazio",
  "Rieti": "Lazio", "RI": "Lazio",
  "Roma": "Lazio", "Rome": "Lazio", "RM": "Lazio",
  "Viterbo": "Lazio", "VT": "Lazio",

  // ── Liguria ──
  "Genova": "Liguria", "Genoa": "Liguria", "GE": "Liguria",
  "Imperia": "Liguria", "IM": "Liguria",
  "La Spezia": "Liguria", "SP": "Liguria",
  "Savona": "Liguria", "SV": "Liguria",

  // ── Lombardia ──
  "Bergamo": "Lombardia", "BG": "Lombardia",
  "Brescia": "Lombardia", "BS": "Lombardia",
  "Como": "Lombardia", "CO": "Lombardia",
  "Cremona": "Lombardia", "CR": "Lombardia",
  "Lecco": "Lombardia", "LC": "Lombardia",
  "Lodi": "Lombardia", "LO": "Lombardia",
  "Mantova": "Lombardia", "Mantua": "Lombardia", "MN": "Lombardia",
  "Milano": "Lombardia", "Milan": "Lombardia", "MI": "Lombardia",
  "Monza e Brianza": "Lombardia", "Monza e della Brianza": "Lombardia", "Monza": "Lombardia", "MB": "Lombardia",
  "Pavia": "Lombardia", "PV": "Lombardia",
  "Sondrio": "Lombardia", "SO": "Lombardia",
  "Varese": "Lombardia", "VA": "Lombardia",

  // ── Marche ──
  "Ancona": "Marche", "AN": "Marche",
  "Ascoli Piceno": "Marche", "AP": "Marche",
  "Fermo": "Marche", "FM": "Marche",
  "Macerata": "Marche", "MC": "Marche",
  "Pesaro e Urbino": "Marche", "Pesaro": "Marche", "PU": "Marche",

  // ── Molise ──
  "Campobasso": "Molise", "CB": "Molise",
  "Isernia": "Molise", "IS": "Molise",

  // ── Piemonte ──
  "Alessandria": "Piemonte", "AL": "Piemonte",
  "Asti": "Piemonte", "AT": "Piemonte",
  "Biella": "Piemonte", "BI": "Piemonte",
  "Cuneo": "Piemonte", "CN": "Piemonte",
  "Novara": "Piemonte", "NO": "Piemonte",
  "Torino": "Piemonte", "Turin": "Piemonte", "TO": "Piemonte",
  "Verbano-Cusio-Ossola": "Piemonte", "VB": "Piemonte",
  "Vercelli": "Piemonte", "VC": "Piemonte",

  // ── Puglia ──
  "Bari": "Puglia", "BA": "Puglia",
  "Barletta-Andria-Trani": "Puglia", "BT": "Puglia",
  "Brindisi": "Puglia", "BR": "Puglia",
  "Foggia": "Puglia", "FG": "Puglia",
  "Lecce": "Puglia", "LE": "Puglia",
  "Taranto": "Puglia", "TA": "Puglia",

  // ── Sardegna ──
  "Cagliari": "Sardegna", "CA": "Sardegna",
  "Nuoro": "Sardegna", "NU": "Sardegna",
  "Oristano": "Sardegna", "OR": "Sardegna",
  "Sassari": "Sardegna", "SS": "Sardegna",
  "Sud Sardegna": "Sardegna", "SU": "Sardegna",

  // ── Sicilia ──
  "Agrigento": "Sicilia", "AG": "Sicilia",
  "Caltanissetta": "Sicilia", "CL": "Sicilia",
  "Catania": "Sicilia", "CT": "Sicilia",
  "Enna": "Sicilia", "EN": "Sicilia",
  "Messina": "Sicilia", "ME": "Sicilia",
  "Palermo": "Sicilia", "PA": "Sicilia",
  "Ragusa": "Sicilia", "RG": "Sicilia",
  "Siracusa": "Sicilia", "Syracuse": "Sicilia", "SR": "Sicilia",
  "Trapani": "Sicilia", "TP": "Sicilia",

  // ── Toscana ──
  "Arezzo": "Toscana", "AR": "Toscana",
  "Firenze": "Toscana", "Florence": "Toscana", "FI": "Toscana",
  "Grosseto": "Toscana", "GR": "Toscana",
  "Livorno": "Toscana", "Leghorn": "Toscana", "LI": "Toscana",
  "Lucca": "Toscana", "LU": "Toscana",
  "Massa-Carrara": "Toscana", "Massa e Carrara": "Toscana", "MS": "Toscana",
  "Pisa": "Toscana", "PI": "Toscana",
  "Pistoia": "Toscana", "PT": "Toscana",
  "Prato": "Toscana", "PO": "Toscana",
  "Siena": "Toscana", "SI": "Toscana",

  // ── Trentino-Alto Adige ──
  "Bolzano": "Trentino-Alto Adige", "Bozen": "Trentino-Alto Adige", "BZ": "Trentino-Alto Adige",
  "Trento": "Trentino-Alto Adige", "TN": "Trentino-Alto Adige",

  // ── Umbria ──
  "Perugia": "Umbria", "PG": "Umbria",
  "Terni": "Umbria", "TR": "Umbria",

  // ── Valle d'Aosta ──
  "Aosta": "Valle d'Aosta", "AO": "Valle d'Aosta",
  "Valle d'Aosta": "Valle d'Aosta", "Aosta Valley": "Valle d'Aosta",

  // ── Veneto ──
  "Belluno": "Veneto", "BL": "Veneto",
  "Padova": "Veneto", "Padua": "Veneto", "PD": "Veneto",
  "Rovigo": "Veneto", "RO": "Veneto",
  "Treviso": "Veneto", "TV": "Veneto",
  "Venezia": "Veneto", "Venice": "Veneto", "VE": "Veneto",
  "Verona": "Veneto", "VR": "Veneto",
  "Vicenza": "Veneto", "VI": "Veneto",
};

// Also match region names directly (some APIs return region instead of province)
const REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana",
  "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto",
];

for (const r of REGIONS) {
  PROVINCE_TO_REGION[r] = r;
}

// Common English variants for regions
PROVINCE_TO_REGION["Lombardy"] = "Lombardia";
PROVINCE_TO_REGION["Piedmont"] = "Piemonte";
PROVINCE_TO_REGION["Tuscany"] = "Toscana";
PROVINCE_TO_REGION["Sicily"] = "Sicilia";
PROVINCE_TO_REGION["Sardinia"] = "Sardegna";
PROVINCE_TO_REGION["Apulia"] = "Puglia";
PROVINCE_TO_REGION["Trentino-South Tyrol"] = "Trentino-Alto Adige";
PROVINCE_TO_REGION["Friuli-Venezia Giulia"] = "Friuli Venezia Giulia";

export function provinceToRegion(province: string | null): string | null {
  if (!province) return null;
  const trimmed = province.trim();
  return PROVINCE_TO_REGION[trimmed] || PROVINCE_TO_REGION[trimmed.replace(/Province of /i, '')] || null;
}
