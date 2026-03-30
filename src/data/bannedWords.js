/**
 * Lista de palabras prohibidas en español e inglés.
 * Incluye variaciones comunes para evadir filtros.
 */

const bannedWordsES = [
    // Insultos y groserías en español
    "puta", "puto", "putamadre", "hijo de puta", "hijueputa","putita",
    "mierda", "mrd", "mrda",
    "pendejo", "pendeja",
    "idiota", "imbecil", "imbécil",
    "estupido", "estúpido", "estupida", "estúpida",
    "marica", "maricon", "maricón",
    "joto", "jota",
    "verga", "vrga", "verg4",
    "chinga", "chingada", "chingar", "chingado",
    "cabron", "cabrón", "cabrona",
    "culero", "culera",
    "mamón", "mamon", "mamona",
    "pinche",
    "coño", "cono",
    "huevon", "huevón", "weon", "weón",
    "zorra", "zorr4",
    "perra",
    "malparido", "malparida",
    "gonorrea",
    "hp", "hdp", "hdpt", "hpta",
    "ctm", "conchetumadre", "conchetumare",
    "csm", "csmr",
    "ptm",
    "boludo", "boluda",
    "pelotudo", "pelotuda",
    "forro", "forra",
    "mogolico", "mogólico",
    "retrasado", "retrasada",
    "subnormal",
    "tarado", "tarada",
    "baboso", "babosa",
    "naco", "naca",
    "corriente",
    "mugroso", "mugrosa",

    // Contenido sexual / acoso en español
    "porno", "pornografia", "pornografía",
    "sexo oral",
    "masturbar", "masturbación",
    "violación", "violacion", "violar",
    "pedofilo", "pedófilo", "pedofilia",
    "cp",

    // Discriminación en español
    "negro de mierda",
    "indio de mierda",
    "sudaca",
    "terrorista",

    // Drogas en español
    "metanfetamina", "cocaina", "cocaína",
    "heroina", "heroína",
    "crack",
    "marihuana",
];

const bannedWordsEN = [
    // Insultos y groserías en inglés
    "fuck", "fck", "f*ck", "fuk", "fuq", "phuck",
    "shit", "sh1t", "sht", "bullshit",
    "bitch", "b1tch", "biatch",
    "asshole", "a$$hole", "assh0le",
    "bastard", "b4stard",
    "damn", "dammit",
    "dick", "d1ck",
    "cock", "c0ck",
    "pussy", "puss1",
    "cunt", "c*nt",
    "whore", "wh0re",
    "slut", "sl*t",
    "douche", "douchebag",
    "moron",
    "dumbass",
    "jackass",
    "motherfucker", "mf", "stfu", "gtfo",

    // Contenido sexual / acoso en inglés
    "porn", "p0rn",
    "hentai",
    "rape", "r4pe",
    "molest",
    "pedophile", "pedo",
    "cp",

    // Discriminación en inglés
    "nigger", "n1gger", "nigg4", "n1gg3r", "nigga",
    "faggot", "f4ggot", "fag",
    "retard", "ret4rd",
    "tranny",
    "spic", "sp1c",
    "chink",
    "kike",
    "wetback",
    "cracker",
    "beaner",

    // Amenazas
    "kys", "kill yourself",
    "die", "go die",
    "neck yourself",

    // Drogas en inglés
    "meth",
    "cocaine",
    "heroin",
];

// Combinar ambas listas y eliminar duplicados
const allBannedWords = [...new Set([...bannedWordsES, ...bannedWordsEN])];

module.exports = {
    bannedWordsES,
    bannedWordsEN,
    allBannedWords,
};
