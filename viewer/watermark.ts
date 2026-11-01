/**
 * Theme-specific signature watermark illustrations rendered in the canvas corner.
 * Provides subtle ambient branding and atmosphere for each of the 13 themes.
 */

export function renderThemeWatermark(theme: string): string {
  switch (theme) {
    case "christmas":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Christmas Pine Watermark">
          <!-- Star atop the tree -->
          <polygon points="60,10 63,20 74,20 65,26 69,36 60,30 51,36 55,26 46,20 57,20" fill="var(--amber, #80643f)" stroke="var(--amber, #80643f)" stroke-width="1"/>
          <!-- Tree tiers -->
          <path d="M60 28 L46 44 H54 L38 62 H48 L28 84 H92 L72 62 H82 L66 44 H74 Z" fill="var(--panel2, #114232)" stroke="var(--sys, #008571)" stroke-width="2"/>
          <!-- Tree trunk -->
          <rect x="54" y="84" width="12" height="14" rx="2" fill="var(--border, #114232)" stroke="var(--border2, #861a22)"/>
          <!-- Ornaments / Baubles -->
          <circle cx="48" cy="50" r="2.8" fill="var(--accent, #a52019)" stroke="none"/>
          <circle cx="70" cy="54" r="2.8" fill="var(--border2, #861a22)" stroke="none"/>
          <circle cx="42" cy="72" r="3.2" fill="var(--amber, #80643f)" stroke="none"/>
          <circle cx="62" cy="68" r="3" fill="var(--accent, #a52019)" stroke="none"/>
          <circle cx="78" cy="74" r="2.8" fill="var(--sys, #008571)" stroke="none"/>
          <!-- Snow drifts / base -->
          <path d="M20 102 Q40 96 60 100 T100 102" stroke="var(--ink, #fefce8)" stroke-width="1.2" opacity="0.6"/>
          <!-- Drifting snowflakes -->
          <circle cx="28" cy="32" r="1.2" fill="var(--ink, #fefce8)"/>
          <circle cx="92" cy="38" r="1.5" fill="var(--ink, #fefce8)"/>
          <circle cx="86" cy="22" r="1" fill="var(--ink, #fefce8)"/>
        </svg>
      `;

    case "neon-noir":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Neon Noir Watermark">
          <!-- Glitch frame brackets -->
          <path d="M12 28 V12 H28 M92 12 H108 V28 M108 92 V108 H92 M28 108 H12 V92" stroke="var(--border2, #c5003c)" stroke-width="2"/>
          <!-- Circuit traces -->
          <path d="M12 60 H28 L36 52 H48" stroke="var(--sys, #55ead4)" stroke-width="1.4" opacity="0.8"/>
          <circle cx="48" cy="52" r="2" fill="var(--sys, #55ead4)"/>
          <path d="M108 60 H92 L84 68 H72" stroke="var(--ink, #f3e600)" stroke-width="1.4" opacity="0.8"/>
          <circle cx="72" cy="68" r="2" fill="var(--ink, #f3e600)"/>
          <!-- Stylized Cyber Skull / Visor Mask -->
          <polygon points="60,24 82,36 82,64 74,84 60,94 46,84 38,64 38,36" fill="var(--panel2, #0b1422)" stroke="var(--ink, #f3e600)" stroke-width="2"/>
          <!-- Visor bar -->
          <path d="M42 48 H78 L74 58 H46 Z" fill="var(--sys, #55ead4)" stroke="var(--accent, #fee801)" stroke-width="1.2"/>
          <!-- Teeth / grill grid -->
          <line x1="52" y1="76" x2="52" y2="84" stroke="var(--border2, #c5003c)"/>
          <line x1="60" y1="76" x2="60" y2="86" stroke="var(--border2, #c5003c)"/>
          <line x1="68" y1="76" x2="68" y2="84" stroke="var(--border2, #c5003c)"/>
          <!-- Neon badge -->
          <text x="60" y="106" text-anchor="middle" font-family="monospace" font-size="9" font-weight="700" fill="var(--ink, #f3e600)" letter-spacing="3">NEON</text>
        </svg>
      `;

    case "tokyonight":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Tokyo Night Watermark">
          <!-- Crescent Moon -->
          <path d="M84 18 A22 22 0 1 0 102 46 A18 18 0 1 1 84 18 Z" fill="var(--amber, #e0af68)" opacity="0.3" stroke="var(--amber, #e0af68)" stroke-width="1.5"/>
          <!-- Traditional Japanese Torii Gate -->
          <path d="M26 44 Q60 38 94 44" stroke="var(--stage-docs, #f7768e)" stroke-width="3.5"/>
          <path d="M32 50 H88" stroke="var(--accent, #7aa2f7)" stroke-width="2.5"/>
          <rect x="36" y="50" width="6" height="52" rx="1" fill="var(--border, #292e42)" stroke="var(--stage-docs, #f7768e)" stroke-width="1.5"/>
          <rect x="78" y="50" width="6" height="52" rx="1" fill="var(--border, #292e42)" stroke="var(--stage-docs, #f7768e)" stroke-width="1.5"/>
          <rect x="56" y="44" width="8" height="10" fill="var(--stage-adrs, #bb9af7)" stroke="none"/>
          <!-- Floating Sakura Petals -->
          <ellipse cx="28" cy="28" rx="3.5" ry="2" transform="rotate(-25 28 28)" fill="var(--stage-docs, #f7768e)"/>
          <ellipse cx="40" cy="20" rx="3" ry="1.8" transform="rotate(15 40 20)" fill="var(--stage-docs, #f7768e)"/>
          <ellipse cx="94" cy="62" rx="3.5" ry="2" transform="rotate(45 94 62)" fill="var(--stage-docs, #f7768e)"/>
          <ellipse cx="22" cy="74" rx="3.2" ry="1.8" transform="rotate(-15 22 74)" fill="var(--stage-docs, #f7768e)"/>
          <!-- Soft mountain silhouettes in background -->
          <path d="M10 102 L42 82 L70 98 L110 76" stroke="var(--border2, #3b4261)" stroke-width="1.2" opacity="0.5"/>
        </svg>
      `;

    case "synthwave":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Synthwave Outrun Watermark">
          <!-- Striped Outrun Sun -->
          <circle cx="60" cy="50" r="26" fill="var(--fil, #ffe600)" opacity="0.3"/>
          <circle cx="60" cy="50" r="26" stroke="var(--con, #ff007f)" stroke-width="2"/>
          <line x1="36" y1="52" x2="84" y2="52" stroke="var(--bg, #0c051c)" stroke-width="2.5"/>
          <line x1="38" y1="58" x2="82" y2="58" stroke="var(--bg, #0c051c)" stroke-width="3"/>
          <line x1="42" y1="64" x2="78" y2="64" stroke="var(--bg, #0c051c)" stroke-width="3.5"/>
          <line x1="48" y1="70" x2="72" y2="70" stroke="var(--bg, #0c051c)" stroke-width="4"/>
          <!-- Horizon Grid Lines -->
          <line x1="10" y1="76" x2="110" y2="76" stroke="var(--sys, #0ff0fc)" stroke-width="2"/>
          <line x1="14" y1="84" x2="106" y2="84" stroke="var(--sys, #0ff0fc)" stroke-width="1.5" opacity="0.8"/>
          <line x1="18" y1="92" x2="102" y2="92" stroke="var(--sys, #0ff0fc)" stroke-width="1.2" opacity="0.6"/>
          <line x1="22" y1="100" x2="98" y2="100" stroke="var(--sys, #0ff0fc)" stroke-width="1" opacity="0.4"/>
          <!-- Perspective Perspective Lines -->
          <line x1="60" y1="76" x2="60" y2="104" stroke="var(--con, #ff007f)" stroke-width="1.2"/>
          <line x1="60" y1="76" x2="36" y2="104" stroke="var(--con, #ff007f)" stroke-width="1.2"/>
          <line x1="60" y1="76" x2="84" y2="104" stroke="var(--con, #ff007f)" stroke-width="1.2"/>
          <line x1="60" y1="76" x2="14" y2="104" stroke="var(--con, #ff007f)" stroke-width="1.2"/>
          <line x1="60" y1="76" x2="106" y2="104" stroke="var(--con, #ff007f)" stroke-width="1.2"/>
          <!-- Twin palm tree silhouette -->
          <path d="M24 76 Q28 62 26 50" stroke="var(--sys, #0ff0fc)" stroke-width="2"/>
          <path d="M26 50 Q16 46 12 52 M26 50 Q22 40 18 42 M26 50 Q30 38 36 42 M26 50 Q36 46 38 54" stroke="var(--sys, #0ff0fc)" stroke-width="1.5"/>
        </svg>
      `;

    case "spring":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Spring Blossom Watermark">
          <!-- Flowing Sakura Branch -->
          <path d="M14 96 C30 84, 48 88, 64 68 C76 52, 88 44, 106 36" stroke="var(--border, #2d5443)" stroke-width="3"/>
          <path d="M64 68 C68 56, 76 52, 86 52" stroke="var(--border, #2d5443)" stroke-width="2"/>
          <path d="M42 86 C40 76, 44 70, 52 66" stroke="var(--border, #2d5443)" stroke-width="1.8"/>
          <!-- Blossoms -->
          <!-- Flower 1 -->
          <circle cx="86" cy="52" r="5" fill="var(--accent, #f472b6)" stroke="var(--k-file, #facc15)" stroke-width="1.5"/>
          <circle cx="86" cy="52" r="2" fill="var(--k-file, #facc15)"/>
          <!-- Flower 2 -->
          <circle cx="64" cy="68" r="6" fill="var(--accent, #f472b6)" stroke="var(--k-file, #facc15)" stroke-width="1.5"/>
          <circle cx="64" cy="68" r="2.2" fill="var(--k-file, #facc15)"/>
          <!-- Flower 3 -->
          <circle cx="104" cy="36" r="5.5" fill="var(--stage-docs, #f472b6)" stroke="var(--k-file, #facc15)" stroke-width="1.5"/>
          <circle cx="104" cy="36" r="2" fill="var(--k-file, #facc15)"/>
          <!-- Flower 4 -->
          <circle cx="52" cy="66" r="4.5" fill="var(--accent, #f472b6)" stroke="none"/>
          <!-- Young leaves -->
          <path d="M78 48 Q82 40 88 44 Q84 50 78 48 Z" fill="var(--stage-features, #34d399)" stroke="none"/>
          <path d="M56 60 Q62 54 66 58 Q62 64 56 60 Z" fill="var(--stage-features, #34d399)" stroke="none"/>
          <!-- Drifting Petals -->
          <ellipse cx="32" cy="46" rx="4" ry="2.2" transform="rotate(-30 32 46)" fill="var(--accent, #f472b6)" opacity="0.8"/>
          <ellipse cx="48" cy="34" rx="3.5" ry="2" transform="rotate(25 48 34)" fill="var(--accent, #f472b6)" opacity="0.7"/>
          <ellipse cx="78" cy="26" rx="3.8" ry="2" transform="rotate(-15 78 26)" fill="var(--accent, #f472b6)" opacity="0.9"/>
          <ellipse cx="98" cy="68" rx="3.2" ry="1.8" transform="rotate(40 98 68)" fill="var(--accent, #f472b6)" opacity="0.75"/>
        </svg>
      `;

    case "summer":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Summer Azure Watermark">
          <!-- Radiant Sun with Rays -->
          <circle cx="60" cy="40" r="16" fill="var(--amber, #f59e0b)" opacity="0.25" stroke="var(--amber, #f59e0b)" stroke-width="2"/>
          <path d="M60 16 V22 M60 58 V64 M36 40 H42 M78 40 H84 M43 23 L47 27 M73 53 L77 57 M43 57 L47 53 M73 27 L77 23" stroke="var(--amber, #f59e0b)" stroke-width="1.8"/>
          <!-- Rolling Ocean Waves -->
          <!-- Background wave -->
          <path d="M12 84 C30 76, 45 92, 65 82 C85 72, 100 86, 112 80" stroke="var(--accent, #ff6b6b)" stroke-width="2" opacity="0.6"/>
          <!-- Mid wave -->
          <path d="M8 92 C28 82, 50 96, 72 86 C92 76, 104 90, 116 86" stroke="var(--sys, #38bdf8)" stroke-width="2.5"/>
          <!-- Foreground Great Wave crest -->
          <path d="M6 102 C26 94, 46 104, 68 96 C88 88, 102 98, 118 94 L118 108 L6 108 Z" fill="var(--panel2, #112f45)" stroke="var(--stage-features, #2dd4bf)" stroke-width="2"/>
          <!-- Sea spray foam droplets -->
          <circle cx="58" cy="80" r="1.5" fill="var(--ink, #e0f2fe)"/>
          <circle cx="64" cy="74" r="1.2" fill="var(--ink, #e0f2fe)"/>
          <circle cx="70" cy="78" r="1.5" fill="var(--ink, #e0f2fe)"/>
        </svg>
      `;

    case "autumn":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Autumn Amber Watermark">
          <!-- Great Japanese Momiji Maple Leaf -->
          <path d="M60 20 
                   Q62 34 68 38 Q78 30 84 34 Q78 42 84 48 Q94 48 98 54 Q88 60 90 68 Q78 68 74 76 Q66 74 60 82 
                   Q54 74 46 76 Q42 68 30 68 Q32 60 22 54 Q26 48 36 48 Q42 42 36 34 Q42 30 52 38 Q58 34 60 20 Z" 
                fill="var(--panel2, #301d10)" stroke="var(--accent, #ea580c)" stroke-width="2"/>
          <!-- Leaf main stem & veins -->
          <path d="M60 82 L60 102" stroke="var(--border, #523118)" stroke-width="2.5"/>
          <path d="M60 82 L60 32" stroke="var(--amber, #eab308)" stroke-width="1.6"/>
          <path d="M60 62 L80 44" stroke="var(--amber, #eab308)" stroke-width="1.2"/>
          <path d="M60 62 L40 44" stroke="var(--amber, #eab308)" stroke-width="1.2"/>
          <path d="M60 72 L74 64" stroke="var(--amber, #eab308)" stroke-width="1.1"/>
          <path d="M60 72 L46 64" stroke="var(--amber, #eab308)" stroke-width="1.1"/>
          <!-- Acorn beside leaf -->
          <ellipse cx="26" cy="88" rx="6" ry="8" fill="var(--stage-adrs, #b91c1c)" stroke="var(--border, #523118)" stroke-width="1.5"/>
          <path d="M19 83 Q26 78 33 83" fill="var(--amber, #eab308)" stroke="var(--border, #523118)" stroke-width="1.5"/>
          <path d="M26 78 L26 72" stroke="var(--border, #523118)" stroke-width="1.8"/>
          <!-- Drifting fall leaves -->
          <ellipse cx="94" cy="86" rx="5" ry="2.5" transform="rotate(35 94 86)" fill="var(--amber, #eab308)" opacity="0.8"/>
          <ellipse cx="88" cy="18" rx="4" ry="2" transform="rotate(-20 88 18)" fill="var(--accent, #ea580c)" opacity="0.8"/>
        </svg>
      `;

    case "light":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Crisp Light Drafting Watermark">
          <!-- Drafting Compass / Protractor Grid -->
          <circle cx="60" cy="60" r="44" stroke="var(--border, #cbd5e1)" stroke-width="1.2" stroke-dasharray="2 3"/>
          <circle cx="60" cy="60" r="32" stroke="var(--border2, #e2e8f0)" stroke-width="1"/>
          <!-- Compass rose crosshairs -->
          <line x1="60" y1="10" x2="60" y2="110" stroke="var(--accent, #0284c7)" stroke-width="1.5"/>
          <line x1="10" y1="60" x2="110" y2="60" stroke="var(--accent, #0284c7)" stroke-width="1.5"/>
          <!-- 45-degree diagonal ticks -->
          <line x1="28" y1="28" x2="34" y2="34" stroke="var(--muted, #475569)"/>
          <line x1="92" y1="28" x2="86" y2="34" stroke="var(--muted, #475569)"/>
          <line x1="28" y1="92" x2="34" y2="86" stroke="var(--muted, #475569)"/>
          <line x1="92" y1="92" x2="86" y2="86" stroke="var(--muted, #475569)"/>
          <!-- Precision Architect Compass Legs -->
          <path d="M60 30 L44 86 M60 30 L76 86" stroke="var(--sys, #2563eb)" stroke-width="2.5"/>
          <circle cx="60" cy="30" r="4" fill="var(--accent, #0284c7)" stroke="var(--panel, #ffffff)" stroke-width="1.5"/>
          <line x1="48" y1="66" x2="72" y2="66" stroke="var(--sys, #2563eb)" stroke-width="1.5"/>
        </svg>
      `;

    case "nord-light":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Nord Snow Storm Watermark">
          <!-- Nordic 8-fold Arctic Snowflake -->
          <line x1="60" y1="14" x2="60" y2="106" stroke="var(--accent, #5e81ac)" stroke-width="2"/>
          <line x1="14" y1="60" x2="106" y2="60" stroke="var(--accent, #5e81ac)" stroke-width="2"/>
          <line x1="27" y1="27" x2="93" y2="93" stroke="var(--sys, #88c0d0)" stroke-width="1.8"/>
          <line x1="27" y1="93" x2="93" y2="27" stroke="var(--sys, #88c0d0)" stroke-width="1.8"/>
          <!-- Snowflake Branch Chevrons -->
          <!-- Top branch -->
          <path d="M54 26 L60 20 L66 26 M52 38 L60 30 L68 38" stroke="var(--sys, #88c0d0)" stroke-width="1.5"/>
          <!-- Bottom branch -->
          <path d="M54 94 L60 100 L66 94 M52 82 L60 90 L68 82" stroke="var(--sys, #88c0d0)" stroke-width="1.5"/>
          <!-- Left branch -->
          <path d="M26 54 L20 60 L26 66 M38 52 L30 60 L38 68" stroke="var(--sys, #88c0d0)" stroke-width="1.5"/>
          <!-- Right branch -->
          <path d="M94 54 L100 60 L94 66 M82 52 L90 60 L82 68" stroke="var(--sys, #88c0d0)" stroke-width="1.5"/>
          <!-- Center diamond core -->
          <polygon points="60,50 70,60 60,70 50,60" fill="var(--panel, #ffffff)" stroke="var(--accent, #5e81ac)" stroke-width="1.8"/>
          <circle cx="60" cy="60" r="2.5" fill="var(--stage-features, #a3be8c)"/>
        </svg>
      `;

    case "solarized-light":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Solarized Astrolabe Watermark">
          <!-- Solar Disk with Concentric Astrolabe Rings -->
          <circle cx="60" cy="60" r="46" stroke="var(--border, #d3cbb7)" stroke-width="1.2"/>
          <circle cx="60" cy="60" r="36" stroke="var(--accent, #268bd2)" stroke-width="1.5"/>
          <circle cx="60" cy="60" r="22" stroke="var(--amber, #b58900)" stroke-width="2" stroke-dasharray="3 3"/>
          <!-- Solar Core -->
          <circle cx="60" cy="60" r="10" fill="var(--amber, #b58900)" stroke="var(--sys, #2aa198)" stroke-width="2"/>
          <!-- Ray ticks -->
          <line x1="60" y1="8" x2="60" y2="18" stroke="var(--accent, #268bd2)" stroke-width="2"/>
          <line x1="60" y1="102" x2="60" y2="112" stroke="var(--accent, #268bd2)" stroke-width="2"/>
          <line x1="8" y1="60" x2="18" y2="60" stroke="var(--accent, #268bd2)" stroke-width="2"/>
          <line x1="102" y1="60" x2="112" y2="60" stroke="var(--accent, #268bd2)" stroke-width="2"/>
          <!-- Orbiting planet nodes -->
          <circle cx="86" cy="36" r="3.5" fill="var(--stage-features, #859900)" stroke="none"/>
          <circle cx="34" cy="78" r="4" fill="var(--stage-docs, #d33682)" stroke="none"/>
          <circle cx="60" cy="24" r="2.5" fill="var(--rel-dependency, #b58900)" stroke="none"/>
        </svg>
      `;

    case "repo-light":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Repo Light Git Graph Watermark">
          <!-- Git Commit & Branching Graph Tree -->
          <!-- Trunk Line -->
          <line x1="36" y1="18" x2="36" y2="102" stroke="var(--accent, #0969da)" stroke-width="2.5"/>
          <!-- Feature Branch Curve -->
          <path d="M36 40 C36 56, 74 48, 74 66 L74 90 C74 98, 36 94, 36 102" stroke="var(--stage-features, #1a7f37)" stroke-width="2.2"/>
          <!-- Release Tag Branch -->
          <path d="M36 68 C36 78, 92 72, 92 84" stroke="var(--stage-adrs, #8250df)" stroke-width="2"/>
          <!-- Commit Nodes -->
          <circle cx="36" cy="26" r="5" fill="var(--panel, #ffffff)" stroke="var(--accent, #0969da)" stroke-width="2.5"/>
          <circle cx="36" cy="48" r="5" fill="var(--panel, #ffffff)" stroke="var(--accent, #0969da)" stroke-width="2.5"/>
          <circle cx="74" cy="66" r="5" fill="var(--panel, #ffffff)" stroke="var(--stage-features, #1a7f37)" stroke-width="2.5"/>
          <circle cx="74" cy="84" r="4.5" fill="var(--panel, #ffffff)" stroke="var(--stage-features, #1a7f37)" stroke-width="2.2"/>
          <circle cx="92" cy="84" r="4.5" fill="var(--panel, #ffffff)" stroke="var(--stage-adrs, #8250df)" stroke-width="2.2"/>
          <circle cx="36" cy="82" r="5" fill="var(--panel, #ffffff)" stroke="var(--accent, #0969da)" stroke-width="2.5"/>
          <circle cx="36" cy="102" r="6" fill="var(--accent, #0969da)" stroke="var(--panel, #ffffff)" stroke-width="2"/>
        </svg>
      `;

    case "sepia":
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Vintage Parchment Cartography Watermark">
          <!-- Renaissance Nautical Compass Rose -->
          <circle cx="60" cy="60" r="46" stroke="var(--border, #dacdb1)" stroke-width="1.5"/>
          <circle cx="60" cy="60" r="40" stroke="var(--border2, #c9bba0)" stroke-width="1" stroke-dasharray="2 2"/>
          <!-- 8-Point Compass Star Points -->
          <!-- North Point -->
          <polygon points="60,18 64,54 60,60" fill="var(--accent, #9a3412)" stroke="none"/>
          <polygon points="60,18 56,54 60,60" fill="var(--border, #dacdb1)" stroke="none"/>
          <!-- South Point -->
          <polygon points="60,102 64,66 60,60" fill="var(--border, #dacdb1)" stroke="none"/>
          <polygon points="60,102 56,66 60,60" fill="var(--accent, #9a3412)" stroke="none"/>
          <!-- East Point -->
          <polygon points="102,60 66,64 60,60" fill="var(--accent, #9a3412)" stroke="none"/>
          <polygon points="102,60 66,56 60,60" fill="var(--border, #dacdb1)" stroke="none"/>
          <!-- West Point -->
          <polygon points="18,60 54,64 60,60" fill="var(--border, #dacdb1)" stroke="none"/>
          <polygon points="18,60 54,56 60,60" fill="var(--accent, #9a3412)" stroke="none"/>
          <!-- Central Brass Ring -->
          <circle cx="60" cy="60" r="6" fill="var(--panel, #faf6ed)" stroke="var(--amber, #b45309)" stroke-width="2"/>
          <circle cx="60" cy="60" r="2" fill="var(--accent, #9a3412)"/>
          <!-- Fleur-de-lis / North arrow header -->
          <path d="M57 14 Q60 8 63 14" stroke="var(--accent, #9a3412)" stroke-width="1.8"/>
        </svg>
      `;

    case "dark":
    default:
      return `
        <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Deep Cosmos Galaxy Watermark">
          <!-- Deep Cosmos Spiral Galaxy Arms -->
          <path d="M60 60 A12 12 0 0 1 72 60 A24 24 0 0 1 48 84 A36 36 0 0 1 24 48 A48 48 0 0 1 84 20" stroke="var(--accent, #38bdf8)" stroke-width="1.8" opacity="0.8"/>
          <path d="M60 60 A12 12 0 0 1 48 60 A24 24 0 0 1 72 36 A36 36 0 0 1 96 72 A48 48 0 0 1 36 100" stroke="var(--sys, #6b94f5)" stroke-width="1.8" opacity="0.8"/>
          <!-- Nucleus Hub Core -->
          <circle cx="60" cy="60" r="6" fill="var(--accent, #38bdf8)" opacity="0.3"/>
          <circle cx="60" cy="60" r="3" fill="var(--ink, #e7e9ea)"/>
          <!-- Satellite stellar nodes & orbit links -->
          <circle cx="84" cy="20" r="3" fill="var(--amber, #fbbf24)"/>
          <circle cx="36" cy="100" r="3" fill="var(--stage-features, #10b981)"/>
          <circle cx="24" cy="48" r="2.5" fill="var(--stage-docs, #c084fc)"/>
          <circle cx="96" cy="72" r="2.5" fill="var(--stage-docs, #ec4899)"/>
          <circle cx="48" cy="84" r="2" fill="var(--accent, #38bdf8)"/>
          <circle cx="72" cy="36" r="2" fill="var(--accent, #38bdf8)"/>
        </svg>
      `;
  }
}
