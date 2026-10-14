import type { MaxRelease } from './bulbapedia';
import {
  backfillReleasedDynamaxForms,
  backfillReleasedGigantamaxForms,
  dropUnreleasedGigantamaxForms,
  finalEvolutionDexNumbers,
  splitDynamaxForms,
  splitGigantamaxForms,
  type GigantamaxSpriteFetcher,
} from './max-forms';
import type { RawAssetForm, RawPokemon } from './transform';

function pokemon(dexNr: number, name: string, overrides: Partial<RawPokemon> = {}): RawPokemon {
  const id = name.toUpperCase();
  return {
    id,
    formId: id,
    dexNr,
    generation: 1,
    names: { English: name },
    primaryType: { type: 'POKEMON_TYPE_NORMAL' },
    secondaryType: null,
    pokemonClass: null,
    assets: { image: `${id}.png`, shinyImage: `${id}.s.png` },
    assetForms: [],
    regionForms: {},
    megaEvolutions: {},
    evolutions: [],
    ...overrides,
  };
}

function assetForm(form: string): RawAssetForm {
  return {
    form,
    costume: null,
    isFemale: false,
    image: `${form}.png`,
    shinyImage: `${form}.s.png`,
  };
}

function forms(entry: RawPokemon): (string | null)[] {
  return entry.assetForms.map((af) => af.form);
}

function spriteFetcher(): ReturnType<typeof vi.fn<GigantamaxSpriteFetcher>> {
  return vi.fn<GigantamaxSpriteFetcher>((speciesName, formSlug) => {
    const slug = formSlug ? `${speciesName}-${formSlug}-gmax` : `${speciesName}-gmax`;
    return Promise.resolve({ image: `${slug}.png`, shinyImage: `${slug}.s.png` });
  });
}

const species = (dexNr: number): MaxRelease => ({ dexNr, form: null });
const form = (dexNr: number, value: string): MaxRelease => ({ dexNr, form: value });

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('finalEvolutionDexNumbers', () => {
  it('includes only species with no further evolution', () => {
    const pokedex = [
      pokemon(1, 'Bulbasaur', { evolutions: [{ id: 'IVYSAUR' }] }),
      pokemon(3, 'Venusaur'),
    ];

    expect(finalEvolutionDexNumbers(pokedex)).toEqual(new Set([3]));
  });
});

describe('dropUnreleasedGigantamaxForms', () => {
  it('drops GMax forms of unreleased species and keeps everything else', () => {
    const venusaur = pokemon(3, 'Venusaur', {
      assetForms: [assetForm('GIGANTAMAX'), assetForm('MEGA')],
    });
    const eevee = pokemon(133, 'Eevee', {
      assetForms: [assetForm('GIGANTAMAX'), assetForm('DYNAMAX')],
    });

    const [patchedVenusaur, patchedEevee] = dropUnreleasedGigantamaxForms(
      [venusaur, eevee],
      [species(3)]
    );

    expect(patchedVenusaur).toBe(venusaur);
    expect(forms(patchedEevee)).toEqual(['DYNAMAX']);
  });

  it('keeps only the released forms of a form-level release', () => {
    const urshifu = pokemon(892, 'Urshifu', {
      assetForms: [
        assetForm('GIGANTAMAX'),
        assetForm('RAPID_STRIKE_GIGANTAMAX'),
        assetForm('SINGLE_STRIKE_GIGANTAMAX'),
      ],
    });

    const [patched] = dropUnreleasedGigantamaxForms([urshifu], [form(892, 'RAPID_STRIKE')]);

    expect(forms(patched)).toEqual(['RAPID_STRIKE_GIGANTAMAX']);
  });
});

describe('backfillReleasedGigantamaxForms', () => {
  it('adds a GIGANTAMAX form from PokeAPI for released species missing one', async () => {
    const fetchSprites = spriteFetcher();
    const pokedex = [
      pokemon(25, 'Pikachu'),
      pokemon(3, 'Venusaur', { assetForms: [assetForm('GIGANTAMAX')] }),
      pokemon(133, 'Eevee'),
    ];

    const [pikachu, venusaur, eevee] = await backfillReleasedGigantamaxForms(
      pokedex,
      [species(25), species(3)],
      fetchSprites
    );

    expect(pikachu.assetForms).toEqual([
      {
        form: 'GIGANTAMAX',
        costume: null,
        isFemale: false,
        image: 'Pikachu-gmax.png',
        shinyImage: 'Pikachu-gmax.s.png',
      },
    ]);
    expect(venusaur).toBe(pokedex[1]);
    expect(eevee).toBe(pokedex[2]);
    expect(fetchSprites).toHaveBeenCalledTimes(1);
    expect(fetchSprites).toHaveBeenCalledWith('Pikachu');
  });

  it("adds a per-form entry from that form's own PokeAPI variety", async () => {
    const fetchSprites = spriteFetcher();

    const [urshifu] = await backfillReleasedGigantamaxForms(
      [pokemon(892, 'Urshifu')],
      [form(892, 'SINGLE_STRIKE'), form(892, 'RAPID_STRIKE')],
      fetchSprites
    );

    expect(forms(urshifu)).toEqual(['SINGLE_STRIKE_GIGANTAMAX', 'RAPID_STRIKE_GIGANTAMAX']);
    expect(urshifu.assetForms[1].image).toBe('Urshifu-rapid-strike-gmax.png');
    expect(fetchSprites).toHaveBeenCalledWith('Urshifu', 'single-strike');
  });

  it('skips a release PokeAPI has no sprite for', async () => {
    const fetchSprites = vi.fn<GigantamaxSpriteFetcher>(() => Promise.resolve(null));
    const pokedex = [pokemon(884, 'Duraludon')];

    const [duraludon] = await backfillReleasedGigantamaxForms(
      pokedex,
      [species(884)],
      fetchSprites
    );

    expect(duraludon).toBe(pokedex[0]);
  });
});

describe('backfillReleasedDynamaxForms', () => {
  const bulbasaur = pokemon(1, 'Bulbasaur', { evolutions: [{ id: 'IVYSAUR' }] });
  const venusaur = pokemon(3, 'Venusaur');
  const finalEvolutions = new Set([3]);

  it("adds a DYNAMAX form reusing the species' own sprite", () => {
    const [, patchedVenusaur] = backfillReleasedDynamaxForms(
      [bulbasaur, venusaur],
      [species(1), species(3)],
      true,
      finalEvolutions
    );

    expect(patchedVenusaur.assetForms).toEqual([
      {
        form: 'DYNAMAX',
        costume: null,
        isFemale: false,
        image: 'VENUSAUR.png',
        shinyImage: 'VENUSAUR.s.png',
      },
    ]);
  });

  it('skips non-final evolutions only when dmaxOnlyFinalEvolution is set', () => {
    const [finalOnly] = backfillReleasedDynamaxForms(
      [bulbasaur],
      [species(1)],
      true,
      finalEvolutions
    );
    const [everyStage] = backfillReleasedDynamaxForms(
      [bulbasaur],
      [species(1)],
      false,
      finalEvolutions
    );

    expect(finalOnly).toBe(bulbasaur);
    expect(forms(everyStage)).toEqual(['DYNAMAX']);
  });

  it('skips unreleased species, species without a sprite, and existing DYNAMAX forms', () => {
    const noSprite = pokemon(4, 'Charmander', { assets: null });
    const alreadyDmax = pokemon(6, 'Charizard', { assetForms: [assetForm('DYNAMAX')] });
    const pokedex = [venusaur, noSprite, alreadyDmax];

    const patched = backfillReleasedDynamaxForms(
      pokedex,
      [species(4), species(6)],
      false,
      finalEvolutions
    );

    expect(patched).toEqual(pokedex);
    expect(forms(patched[2])).toEqual(['DYNAMAX']);
  });

  it('adds the generic entry for form-level releases too', () => {
    const [urshifu] = backfillReleasedDynamaxForms(
      [pokemon(892, 'Urshifu')],
      [form(892, 'RAPID_STRIKE')],
      true,
      new Set([892])
    );

    expect(forms(urshifu)).toEqual(['DYNAMAX']);
  });
});

describe('splitGigantamaxForms', () => {
  const toxtricity = pokemon(849, 'Toxtricity', {
    assetForms: [assetForm('AMPED'), assetForm('GIGANTAMAX'), assetForm('LOW_KEY')],
  });
  const split = [{ dexNr: 849, forms: ['AMPED', 'LOW_KEY'] }];

  it('replaces the generic GMax entry with one per form', async () => {
    const [patched] = await splitGigantamaxForms([toxtricity], split, spriteFetcher());

    expect(forms(patched)).toEqual(['AMPED', 'LOW_KEY', 'AMPED_GIGANTAMAX', 'LOW_KEY_GIGANTAMAX']);
    expect(patched.assetForms[3].image).toBe('Toxtricity-low-key-gmax.png');
  });

  it("falls back to the generic sprite when PokeAPI lacks a form's variety", async () => {
    const [patched] = await splitGigantamaxForms(
      [toxtricity],
      split,
      vi.fn<GigantamaxSpriteFetcher>(() => Promise.resolve(null))
    );

    expect(patched.assetForms[2].image).toBe('GIGANTAMAX.png');
  });

  it('leaves a species without a generic GMax entry, or not listed to split, unchanged', async () => {
    const noGmax = pokemon(849, 'Toxtricity', { assetForms: [assetForm('AMPED')] });
    const venusaur = pokemon(3, 'Venusaur', { assetForms: [assetForm('GIGANTAMAX')] });

    const [patchedToxtricity, patchedVenusaur] = await splitGigantamaxForms(
      [noGmax, venusaur],
      split,
      spriteFetcher()
    );

    expect(patchedToxtricity).toBe(noGmax);
    expect(patchedVenusaur).toBe(venusaur);
  });
});

describe('splitDynamaxForms', () => {
  const urshifu = pokemon(892, 'Urshifu', {
    assetForms: [assetForm('RAPID_STRIKE'), assetForm('SINGLE_STRIKE'), assetForm('DYNAMAX')],
  });
  const releases = [form(892, 'SINGLE_STRIKE'), form(892, 'RAPID_STRIKE')];

  it("replaces the generic DMax entry with one per released form, using each form's sprite", () => {
    const [patched] = splitDynamaxForms([urshifu], releases, true, new Set([892]));

    expect(forms(patched)).toEqual([
      'RAPID_STRIKE',
      'SINGLE_STRIKE',
      'SINGLE_STRIKE_DYNAMAX',
      'RAPID_STRIKE_DYNAMAX',
    ]);
    expect(patched.assetForms[3].image).toBe('RAPID_STRIKE.png');
  });

  it('drops a released form pokemon-go-api has no sprite for, and warns', () => {
    const [patched] = splitDynamaxForms(
      [urshifu],
      [...releases, form(892, 'UNKNOWN_STYLE')],
      true,
      new Set([892])
    );

    expect(forms(patched)).not.toContain('UNKNOWN_STYLE_DYNAMAX');
    expect(forms(patched)).toContain('RAPID_STRIKE_DYNAMAX');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no UNKNOWN_STYLE form'));
  });

  it('keeps the generic DMax entry when none of the released forms exist upstream', () => {
    const [patched] = splitDynamaxForms(
      [urshifu],
      [form(892, 'OTHER_STYLE'), form(892, 'UNKNOWN_STYLE')],
      true,
      new Set([892])
    );

    expect(patched).toBe(urshifu);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('no OTHER_STYLE/UNKNOWN_STYLE form')
    );
  });

  it('keeps the generic DMax entry when the whole species is also released', () => {
    const [patched] = splitDynamaxForms(
      [urshifu],
      [species(892), form(892, 'RAPID_STRIKE')],
      true,
      new Set([892])
    );

    expect(patched).toBe(urshifu);
  });

  it('leaves species-level releases and skipped non-final evolutions unchanged', () => {
    const venusaur = pokemon(3, 'Venusaur', { assetForms: [assetForm('DYNAMAX')] });

    const [patchedVenusaur, patchedUrshifu] = splitDynamaxForms(
      [venusaur, urshifu],
      [species(3), ...releases],
      true,
      new Set([3])
    );

    expect(patchedVenusaur).toBe(venusaur);
    expect(patchedUrshifu).toBe(urshifu);
  });

  it('leaves a form-level release without a generic DMax entry unchanged', () => {
    const noDmax = pokemon(892, 'Urshifu', { assetForms: [assetForm('RAPID_STRIKE')] });

    const [patched] = splitDynamaxForms([noDmax], releases, true, new Set([892]));

    expect(patched).toBe(noDmax);
  });
});
