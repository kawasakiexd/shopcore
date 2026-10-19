export type SeedProduct = {
  slug: string;
  sku: string;
  name: string;
  categorySlug: string;
  description: string;
  priceAmount: number;
  stock: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
};

export const SEED_PRODUCTS: SeedProduct[] = [
  p('audio', 'AUD-ARIA-01', 'Aria ANC Headphones', 19900, 42),
  p('audio', 'AUD-PULSE-01', 'Pulse Studio Headphones', 24900, 18),
  p('audio', 'AUD-NOVA-01', 'Nova Earbuds', 8900, 76),
  p('audio', 'AUD-RIDGE-01', 'Ridge Bluetooth Speaker', 12900, 33),
  p('audio', 'AUD-ECHO-01', 'Echo Mini Speaker', 4900, 0),
  p('audio', 'AUD-STAGE-01', 'Stage Portable DAC', 15900, 21),
  p('audio', 'AUD-VINYL-01', 'Vinyl USB Turntable', 22900, 9),
  p('audio', 'AUD-BEAM-01', 'Beam Soundbar', 27900, 14),
  p('audio', 'AUD-LOOP-01', 'Loop Neckband Earbuds', 5900, 54),
  p('smart-home', 'SMH-HALO-01', 'Halo Smart Bulb 4-Pack', 3900, 88),
  p('smart-home', 'SMH-NEXUS-01', 'Nexus Home Hub', 14900, 27),
  p('smart-home', 'SMH-LOCK-01', 'Keyless Deadbolt', 17900, 16),
  p('smart-home', 'SMH-CAM-01', 'Porch Cam 2K', 9900, 41),
  p('smart-home', 'SMH-THERM-01', 'Climate Dial Thermostat', 12900, 22),
  p('smart-home', 'SMH-PLUG-01', 'Matter Smart Plug 2-Pack', 2900, 120),
  p('smart-home', 'SMH-SENSE-01', 'Air Quality Sense', 7900, 35),
  p('smart-home', 'SMH-BELL-01', 'Chime Video Doorbell', 11900, 0),
  p('smart-home', 'SMH-STRIP-01', 'Ribbon Light Strip 5m', 4500, 63),
  p('workspace', 'WKS-NOVA-01', 'Nova Monitor Arm', 8900, 29),
  p('workspace', 'WKS-DRIFT-01', 'Drift Standing Desk', 39900, 7),
  p('workspace', 'WKS-LINEN-01', 'Linen Desk Chair', 24900, 12),
  p('workspace', 'WKS-KEY-01', 'Low-Profile Keyboard', 11900, 48),
  p('workspace', 'WKS-TRACE-01', 'Trace Wireless Mouse', 5900, 81),
  p('workspace', 'WKS-LAMP-01', 'Arc Desk Lamp', 6900, 37),
  p('workspace', 'WKS-DOCK-01', 'USB-C 8-in-1 Dock', 7900, 44),
  p('workspace', 'WKS-MAT-01', 'Wool Desk Mat', 3900, 70),
  p('kitchen', 'KIT-BREW-01', 'Pour-Over Kettle', 6900, 26),
  p('kitchen', 'KIT-MILL-01', 'Burr Coffee Mill', 14900, 19),
  p('kitchen', 'KIT-PRESS-01', 'Ceramic French Press', 4900, 51),
  p('kitchen', 'KIT-SKIL-01', 'Cast Iron Skillet 10"', 5900, 40),
  p('kitchen', 'KIT-KNIFE-01', 'Santoku Knife 7"', 8900, 23),
  p('kitchen', 'KIT-BLEND-01', 'Compact Blender', 9900, 0),
  p('kitchen', 'KIT-TOAST-01', 'Two-Slice Toaster', 4500, 34),
  p('kitchen', 'KIT-BOARD-01', 'Walnut Cutting Board', 7900, 17),
  p('outdoor', 'OUT-TRAIL-01', 'Trail Daypack 22L', 8900, 31),
  p('outdoor', 'OUT-CAMP-01', 'Camp Mug Titanium', 3900, 66),
  p('outdoor', 'OUT-LANTERN-01', 'Fold Lantern', 4900, 45),
  p('outdoor', 'OUT-CHAIR-01', 'Pack Chair', 7900, 20),
  p('outdoor', 'OUT-BOTTLE-01', 'Insulated Bottle 1L', 3500, 92),
  p('outdoor', 'OUT-HAMMOCK-01', 'Ridge Hammock', 11900, 13),
  p('outdoor', 'OUT-TARP-01', 'Silnylon Tarp', 9900, 0),
  p('outdoor', 'OUT-STOVE-01', 'Pocket Stove', 5900, 38),
  p('bags-accessories', 'BAG-SLING-01', 'Everyday Sling 6L', 6900, 47),
  p('bags-accessories', 'BAG-TOTE-01', 'Canvas Market Tote', 2900, 110),
  p('bags-accessories', 'BAG-WALLET-01', 'Card Folio', 4900, 58),
  p('bags-accessories', 'BAG-SLEEVE-01', 'Laptop Sleeve 14"', 3900, 73),
  p('bags-accessories', 'BAG-CABLE-01', 'Cable Kit', 1900, 150),
  p('bags-accessories', 'BAG-STRAP-01', 'Camera Strap', 4500, 28),
  p('bags-accessories', 'BAG-POUCH-01', 'Tech Pouch', 3500, 64),
  p('bags-accessories', 'BAG-DUFFLE-01', 'Weekender Duffle', 12900, 15),
];

function p(
  categorySlug: string,
  sku: string,
  name: string,
  priceAmount: number,
  stock: number,
): SeedProduct {
  return {
    slug: slugFromName(name),
    sku,
    name,
    categorySlug,
    description: `${name} — a ShopCore demo product built for catalog, cart and checkout walkthroughs.`,
    priceAmount,
    stock,
    status: 'ACTIVE',
  };
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

SEED_PRODUCTS[4]!.status = 'ACTIVE';
SEED_PRODUCTS[4]!.stock = 0;
SEED_PRODUCTS[16]!.stock = 0;
SEED_PRODUCTS[30]!.stock = 0;
SEED_PRODUCTS[38]!.stock = 0;
SEED_PRODUCTS[7]!.status = 'DRAFT';
SEED_PRODUCTS[20]!.status = 'DRAFT';
SEED_PRODUCTS[45]!.status = 'DRAFT';
SEED_PRODUCTS[49]!.status = 'ARCHIVED';
