# Maasvlakte Planning Tool

Interne, alleen-lezen planning-tool voor het Maasvlakte-team van een expediteur.
Er is **geen backend** en **geen auth** — de enige databron is één handmatig
geüpload Excel-bestand (`SAP_planning_Maasvlakte.xlsx`) dat volledig in de
browser wordt geparsed (SheetJS) en in `localStorage` bewaard.

## Stack

- [TanStack Start](https://tanstack.com/start) v1 + Vite 7
- React 19 + TypeScript (strict)
- Tailwind CSS v4 (via `@tailwindcss/vite`, geen `tailwind.config.js`)
- lucide-react iconen, lichte shadcn/ui-achtige componenten
- [SheetJS (`xlsx`)](https://sheetjs.com/) voor het parsen
- `useSyncExternalStore` voor de centrale snapshot-store
- `@tanstack/react-virtual` voor grote tabellen (> 500 rijen)

## Aan de slag

```bash
npm install
npm run dev      # dev-server op http://localhost:3000
npm run build    # productie-build
npm run start    # productie-server draaien
npm run typecheck
```

Open de app, klik rechtsboven op **Excel laden** en kies het bestand
`SAP_planning_Maasvlakte.xlsx`. Voor een snelle test staat er een voorbeeld in
`public/voorbeeld-uit.xlsx`.

## Excel-formaat (`uit`-blad)

| Rij | Inhoud |
| --- | ------ |
| 1–3 | scratch (genegeerd) |
| 4   | klantcodes (tweede header-laag) |
| 5   | hoofdheaders |
| 6+  | data |

## De 5 pagina's

| Route         | Doel |
| ------------- | ---- |
| `/`           | Dashboard — KPI's, taakgroep-kaarten en de takentabel met filters |
| `/tijden`     | Duur (uu:mm:ss) + werkinstructie-PDF per taakkolom |
| `/gebruikers` | Lokale gebruikers, rollen, clusters en de actieve gebruiker |
| `/drempels`   | Drempelwaarden (te laat / kritiek / op tijd) per taakgroep |
| `/clusters`   | Clusters van klantcodes met naam en kleur |

## Persistentie (localStorage)

| Key             | Inhoud |
| --------------- | ------ |
| `snapshot_v1`   | de volledige geïmporteerde snapshot |
| `thresholds_v1` | drempels per taakgroep |
| `durations_v1`  | duur (seconden) per kolom |
| `pdf_urls_v1`   | werkinstructie-URL per kolom |
| `clusters_v1`   | clusters |
| `users_v1`      | lokale gebruikers |
| `active_user_v1`| id van de actieve gebruiker |

Alle defaults staan in de code en worden gebruikt bij lege `localStorage`.
Bij een schema-wijziging wordt de key-versie opgehoogd (`_v1` → `_v2`).
