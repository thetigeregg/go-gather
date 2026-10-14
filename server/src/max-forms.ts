/**
 * The Gigantamax/Dynamax steps of the catalog sync pipeline (see
 * sync.ts's fetchPokedex), driven by the released-Max lists bulbapedia.ts
 * reads. Kept apart from sync.ts — which opens the SQLite database on
 * import — so the logic can be unit tested, with PokeAPI sprite lookups
 * passed in rather than called directly.
 */
import type { MaxRelease } from './bulbapedia.js';
import { isGigantamaxForm, type RawAssets, type RawPokemon } from './transform.js';

export const GIGANTAMAX_FORM = 'GIGANTAMAX';
export const DYNAMAX_FORM = 'DYNAMAX';

export type GigantamaxSpriteFetcher = (
  speciesName: string,
  formSlug?: string
) => Promise<RawAssets | null>;

export interface FormSplit {
  dexNr: number;
  forms: string[];
}

/**
 * A species with `evolutions: []` in pokemon-go-api's raw data is either a
 * single-stage species or already the final stage of its family — used to
 * filter the DMax pokedex down to "only the final evolved form" when
 * `dmaxOnlyFinalEvolution` is set (see sync-overrides.json's `_readme`).
 * Computed once from the raw, pre-backfill pokedex: nothing in this sync
 * pipeline ever mutates `evolutions`, so it stays valid through every
 * subsequent patch/backfill step.
 */
export function finalEvolutionDexNumbers(pokedex: RawPokemon[]): Set<number> {
  return new Set(
    pokedex.filter((pokemon) => pokemon.evolutions.length === 0).map((pokemon) => pokemon.dexNr)
  );
}

function formsByDexNr(releases: MaxRelease[]): Map<number, string[]> {
  const byDexNr = new Map<number, string[]>();
  for (const { dexNr, form } of releases) {
    if (form) {
      byDexNr.set(dexNr, [...(byDexNr.get(dexNr) ?? []), form]);
    }
  }
  return byDexNr;
}

function gigantamaxFormSlug(form: string): string {
  return form.toLowerCase().replace(/_/g, '-');
}

/**
 * pokemon-go-api lists GIGANTAMAX assetForms by mainline-game data, not by
 * what Pokemon GO has released, so any upstream GMax form Bulbapedia
 * doesn't list as released is removed here. A species-level release keeps
 * every GMax form of that species; a form-level release (e.g. Urshifu's
 * `RAPID_STRIKE`) keeps only that form's own `{FORM}_GIGANTAMAX` entry.
 */
export function dropUnreleasedGigantamaxForms(
  pokedex: RawPokemon[],
  releases: MaxRelease[]
): RawPokemon[] {
  const speciesReleased = new Set(releases.filter((r) => !r.form).map((r) => r.dexNr));
  const formReleased = new Set(
    releases.flatMap((r) => (r.form ? [`${String(r.dexNr)}|${r.form}_${GIGANTAMAX_FORM}`] : []))
  );
  let droppedCount = 0;

  const patched = pokedex.map((pokemon) => {
    const kept = pokemon.assetForms.filter(
      (af) =>
        !af.form ||
        !isGigantamaxForm(af.form) ||
        speciesReleased.has(pokemon.dexNr) ||
        formReleased.has(`${String(pokemon.dexNr)}|${af.form}`)
    );
    if (kept.length === pokemon.assetForms.length) {
      return pokemon;
    }
    droppedCount += pokemon.assetForms.length - kept.length;
    return { ...pokemon, assetForms: kept };
  });

  console.log(`Gigantamax release filter: ${String(droppedCount)} unreleased forms dropped.`);

  return patched;
}

/**
 * Adds a GIGANTAMAX assetForms entry, sprite from PokeAPI's `{species}-gmax`
 * variety, for each released Gigantamax species pokemon-go-api doesn't list
 * one for yet — shaped exactly like pokemon-go-api's own GIGANTAMAX entries
 * (see e.g. Venusaur's real one) so it flows through the rest of the
 * pipeline, including transform.ts's `pokedexType: 'max'` derivation, with
 * no special-casing downstream. A form-level release instead gets a
 * `{FORM}_GIGANTAMAX` entry from that form's own PokeAPI variety (e.g.
 * `urshifu-rapid-strike-gmax`). Releases PokeAPI has no sprite for are
 * skipped rather than shown with the wrong art.
 */
export async function backfillReleasedGigantamaxForms(
  pokedex: RawPokemon[],
  releases: MaxRelease[],
  fetchSprites: GigantamaxSpriteFetcher
): Promise<RawPokemon[]> {
  const releasesByDexNr = new Map<number, MaxRelease[]>();
  for (const release of releases) {
    releasesByDexNr.set(release.dexNr, [...(releasesByDexNr.get(release.dexNr) ?? []), release]);
  }
  const patched = [...pokedex];
  let patchedCount = 0;

  for (let index = 0; index < patched.length; index++) {
    const pokemon = patched[index];
    for (const { form } of releasesByDexNr.get(pokemon.dexNr) ?? []) {
      const gmaxForm = form ? `${form}_${GIGANTAMAX_FORM}` : GIGANTAMAX_FORM;
      if (patched[index].assetForms.some((af) => af.form === gmaxForm)) {
        continue;
      }

      const sprites = form
        ? await fetchSprites(pokemon.names.English, gigantamaxFormSlug(form))
        : await fetchSprites(pokemon.names.English);
      if (!sprites) {
        continue;
      }

      patched[index] = {
        ...patched[index],
        assetForms: [
          ...patched[index].assetForms,
          {
            form: gmaxForm,
            costume: null,
            isFemale: false,
            image: sprites.image,
            shinyImage: sprites.shinyImage,
          },
        ],
      };
      patchedCount++;
    }
  }

  console.log(
    `PokeAPI Gigantamax backfill: ${String(patchedCount)} forms added for ${String(releases.length)} released entries.`
  );

  return patched;
}

/**
 * Unlike Gigantamax, Dynamax has no distinct sprite anywhere — it's a
 * universal mainline-game mechanic (any Pokemon can Dynamax) with no unique
 * art, and neither pokemon-go-api nor PokeAPI has any per-species Dynamax
 * signal to key off (confirmed: no field resembling hasGigantamaxEvolution
 * exists for it in either schema). So this just duplicates the species' own
 * base sprite into a synthetic DYNAMAX assetForms entry for every species
 * Bulbapedia lists as released — no PokeAPI fetch needed, since there's
 * nothing distinct to fetch. Form-level releases get the same generic
 * entry here, which splitDynamaxForms below then replaces per form.
 */
export function backfillReleasedDynamaxForms(
  pokedex: RawPokemon[],
  releases: MaxRelease[],
  dmaxOnlyFinalEvolution: boolean,
  finalEvolutionDexNrs: Set<number>
): RawPokemon[] {
  const releasedDexNrs = new Set(releases.map((r) => r.dexNr));
  let patchedCount = 0;

  const patched = pokedex.map((pokemon) => {
    if (!releasedDexNrs.has(pokemon.dexNr) || !pokemon.assets) {
      return pokemon;
    }
    if (dmaxOnlyFinalEvolution && !finalEvolutionDexNrs.has(pokemon.dexNr)) {
      return pokemon;
    }
    if (pokemon.assetForms.some((af) => af.form === DYNAMAX_FORM)) {
      return pokemon;
    }

    patchedCount++;
    return {
      ...pokemon,
      assetForms: [
        ...pokemon.assetForms,
        {
          form: DYNAMAX_FORM,
          costume: null,
          isFemale: false,
          image: pokemon.assets.image,
          shinyImage: pokemon.assets.shinyImage,
        },
      ],
    };
  });

  console.log(
    `Dynamax backfill: ${String(patchedCount)} of ${String(releasedDexNrs.size)} released species patched.`
  );

  return patched;
}

/**
 * A handful of species have multiple real alternate forms whose Gigantamax
 * appearance genuinely differs per form (Toxtricity's Amped/Low Key,
 * confirmed via PokeAPI's separate toxtricity-amped-gmax/
 * toxtricity-low-key-gmax varieties — visually distinct art). pokemon-go-api
 * and Bulbapedia both list one generic Gigantamax Toxtricity regardless, so
 * for each species in `formSplitGigantamaxDexNumbers` this removes that
 * single generic entry and replaces it with one `{FORM}_GIGANTAMAX` entry
 * per listed form, using PokeAPI's per-form gmax variety when available.
 * Runs after backfillReleasedGigantamaxForms so it can assume a generic
 * GIGANTAMAX assetForm already exists (either native to pokemon-go-api, or
 * just backfilled) to split.
 */
export async function splitGigantamaxForms(
  pokedex: RawPokemon[],
  formSplits: FormSplit[],
  fetchSprites: GigantamaxSpriteFetcher
): Promise<RawPokemon[]> {
  const patched = [...pokedex];
  const bySpecies = new Map(formSplits.map((e) => [e.dexNr, e.forms]));
  let patchedCount = 0;

  for (let index = 0; index < patched.length; index++) {
    const pokemon = patched[index];
    const forms = bySpecies.get(pokemon.dexNr);
    if (!forms) {
      continue;
    }

    const genericGmax = pokemon.assetForms.find((af) => af.form === GIGANTAMAX_FORM);
    if (!genericGmax) {
      continue;
    }

    const otherAssetForms = pokemon.assetForms.filter((af) => af.form !== GIGANTAMAX_FORM);
    const splitAssetForms = await Promise.all(
      forms.map(async (form) => {
        const sprites = await fetchSprites(pokemon.names.English, gigantamaxFormSlug(form));
        return {
          form: `${form}_${GIGANTAMAX_FORM}`,
          costume: null,
          isFemale: false,
          // Falls back to the original generic sprite (never drops a listed
          // form) if PokeAPI doesn't have this specific form's own variety.
          image: sprites?.image ?? genericGmax.image,
          shinyImage: sprites?.shinyImage ?? genericGmax.shinyImage,
        };
      })
    );

    patched[index] = {
      ...pokemon,
      assetForms: [...otherAssetForms, ...splitAssetForms],
    };
    patchedCount++;
  }

  console.log(
    `Gigantamax form split: ${String(patchedCount)} of ${String(formSplits.length)} species patched.`
  );

  return patched;
}

/**
 * Dynamax equivalent of splitGigantamaxForms, driven by Bulbapedia's
 * form-level Dynamax releases (Toxtricity's Amped/Low Key, Urshifu's Single
 * Strike/Rapid Strike) — but since Dynamax has no distinct art anywhere,
 * each split entry just reuses that specific form's OWN existing sprite
 * (not the base species sprite backfillReleasedDynamaxForms uses) — no
 * PokeAPI fetch needed. Runs after backfillReleasedDynamaxForms; a no-op
 * for a species that step skipped (nothing to split).
 */
export function splitDynamaxForms(
  pokedex: RawPokemon[],
  releases: MaxRelease[],
  dmaxOnlyFinalEvolution: boolean,
  finalEvolutionDexNrs: Set<number>
): RawPokemon[] {
  const bySpecies = formsByDexNr(releases);
  let patchedCount = 0;

  const patched = pokedex.map((pokemon) => {
    const forms = bySpecies.get(pokemon.dexNr);
    if (!forms) {
      return pokemon;
    }
    if (dmaxOnlyFinalEvolution && !finalEvolutionDexNrs.has(pokemon.dexNr)) {
      return pokemon;
    }

    const genericDmax = pokemon.assetForms.find((af) => af.form === DYNAMAX_FORM);
    if (!genericDmax) {
      return pokemon;
    }

    const otherAssetForms = pokemon.assetForms.filter((af) => af.form !== DYNAMAX_FORM);
    const splitAssetForms = forms.flatMap((form) => {
      const formAssetForm = pokemon.assetForms.find((af) => af.form === form);
      if (!formAssetForm) {
        return [];
      }
      return [
        {
          form: `${form}_${DYNAMAX_FORM}`,
          costume: null,
          isFemale: false,
          image: formAssetForm.image,
          shinyImage: formAssetForm.shinyImage,
        },
      ];
    });

    patchedCount++;
    return { ...pokemon, assetForms: [...otherAssetForms, ...splitAssetForms] };
  });

  console.log(
    `Dynamax form split: ${String(patchedCount)} of ${String(bySpecies.size)} species patched.`
  );

  return patched;
}
