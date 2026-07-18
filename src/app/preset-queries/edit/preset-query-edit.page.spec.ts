import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ActivatedRoute, Router } from '@angular/router';
import { DEFAULT_SETTINGS, PresetQuery, UserSettings } from '@go-gather/shared';
import { PresetQueryEditPage } from './preset-query-edit.page';
import { UserDataService } from '../../core/services/user-data.service';

function makePreset(overrides: Partial<PresetQuery> = {}): PresetQuery {
  return {
    id: 'preset-1',
    name: 'Shundo Regionals',
    groups: [
      {
        id: 'group-1',
        rules: [{ id: 'rule-1', term: { kind: 'region', value: 'alola' }, negate: false }],
      },
    ],
    ...overrides,
  };
}

describe('PresetQueryEditPage', () => {
  let component: PresetQueryEditPage;
  let fixture: ComponentFixture<PresetQueryEditPage>;
  let userSettings: UserSettings;
  let updateUserSettingsCalls: Partial<UserSettings>[];
  let navigateSpy: ReturnType<typeof vi.fn>;
  let routeId: string;

  function setUp(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserDataService,
          useValue: {
            getUserSettings: () => userSettings,
            updateUserSettings: (partial: Partial<UserSettings>) => {
              updateUserSettingsCalls.push(partial);
              userSettings = { ...userSettings, ...partial };
            },
          },
        },
        { provide: Router, useValue: { navigate: navigateSpy } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeId } } },
        },
      ],
    });
    TestBed.overrideComponent(PresetQueryEditPage, {
      set: { template: '<div></div>', styleUrls: [] },
    });

    fixture = TestBed.createComponent(PresetQueryEditPage);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    userSettings = { ...DEFAULT_SETTINGS, userTags: ['shundo'], presetQueries: [makePreset()] };
    updateUserSettingsCalls = [];
    navigateSpy = vi.fn().mockResolvedValue(true);
    routeId = 'new';
    setUp();
  });

  describe('hydration', () => {
    it('starts a fresh single empty group in create mode ("new" route id)', () => {
      routeId = 'new';
      setUp();

      component.ionViewWillEnter();

      expect(component.pageTitle).toBe('New Preset');
      expect(component.name).toBe('');
      expect(component.groups).toHaveLength(1);
      expect(component.groups[0].rules).toHaveLength(0);
    });

    it('hydrates name/groups/rules from the matching preset in edit mode', () => {
      routeId = 'preset-1';
      setUp();

      component.ionViewWillEnter();

      expect(component.pageTitle).toBe('Edit Preset');
      expect(component.name).toBe('Shundo Regionals');
      expect(component.groups).toHaveLength(1);
      expect(component.groups[0].rules).toHaveLength(1);
      expect(component.groups[0].rules[0].catalogEntry.kind).toBe('region');
      expect(component.groups[0].rules[0].enumValue).toBe('alola');
    });

    it('falls back to create mode for an unknown preset id', () => {
      routeId = 'does-not-exist';
      setUp();

      component.ionViewWillEnter();

      expect(component.pageTitle).toBe('New Preset');
    });
  });

  describe('add/remove rules and groups', () => {
    beforeEach(() => {
      routeId = 'new';
      setUp();
      component.ionViewWillEnter();
    });

    it('addRule appends a rule defaulted to the first catalog entry', () => {
      component.addRule(component.groups[0]);

      expect(component.groups[0].rules).toHaveLength(1);
      expect(component.groups[0].rules[0].catalogEntry.kind).toBe(component.termCatalog[0].kind);
    });

    it('removeRule removes only the targeted rule', () => {
      component.addRule(component.groups[0]);
      component.addRule(component.groups[0]);
      const [first, second] = component.groups[0].rules;

      component.removeRule(component.groups[0], first);

      expect(component.groups[0].rules).toEqual([second]);
    });

    it('addGroup/removeGroup manage the group list', () => {
      component.addGroup();
      expect(component.groups).toHaveLength(2);

      component.removeGroup(component.groups[0]);
      expect(component.groups).toHaveLength(1);
    });
  });

  describe('per-inputKind round trip (toEditableRule -> field edit -> toSearchTermData via save)', () => {
    beforeEach(() => {
      routeId = 'new';
      setUp();
      component.ionViewWillEnter();
    });

    function saveAndGetTerm() {
      component.saveClicked();
      const presetQueries = updateUserSettingsCalls[0].presetQueries ?? [];
      const saved = presetQueries[presetQueries.length - 1];
      return saved.groups[0].rules[0].term;
    }

    it('none (hasTag)', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'hasTag');

      expect(saveAndGetTerm()).toEqual({ kind: 'hasTag' });
    });

    it('freeText (name)', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'name');
      component.groups[0].rules[0].freeTextValue = 'Bulbasaur';

      expect(saveAndGetTerm()).toEqual({ kind: 'name', value: 'Bulbasaur' });
    });

    it('tagPicker (tag)', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'tag');
      component.groups[0].rules[0].freeTextValue = 'shundo';

      expect(saveAndGetTerm()).toEqual({ kind: 'tag', value: 'shundo' });
    });

    it('enum (region)', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'region');
      component.groups[0].rules[0].enumValue = 'kanto';

      expect(saveAndGetTerm()).toEqual({ kind: 'region', value: 'kanto' });
    });

    it('enum (type) defaults to a real, non-blank enum option', () => {
      // Regression: defaultValueForCatalogEntry used to default type/moveType/
      // weakAgainst/superEffectiveAgainst's value to '', which matches no
      // ion-select-option — Ionic's own select then desyncs from Angular's
      // ngModel binding on the user's first pick, silently saving an empty
      // value. Defaulting to enumOptions[0] (like region/gender/size/
      // raidOrigin already did) keeps the select's initial value valid.
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'type');

      expect(component.groups[0].rules[0].enumValue).toBe('normal');
      expect(saveAndGetTerm()).toEqual({ kind: 'type', value: 'normal' });
    });

    it('enum (weakAgainst) defaults to a real, non-blank enum option', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'weakAgainst');

      expect(component.groups[0].rules[0].enumValue).toBe('normal');
      expect(saveAndGetTerm()).toEqual({ kind: 'weakAgainst', value: 'normal' });
    });

    it('enum (superEffectiveAgainst) defaults to a real, non-blank enum option', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'superEffectiveAgainst');

      expect(component.groups[0].rules[0].enumValue).toBe('normal');
      expect(saveAndGetTerm()).toEqual({ kind: 'superEffectiveAgainst', value: 'normal' });
    });

    it('enum (moveType) defaults to a real, non-blank enum option', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'moveType');

      expect(component.groups[0].rules[0].enumValue).toBe('normal');
      expect(saveAndGetTerm()).toEqual({ kind: 'moveType', value: 'normal' });
    });

    it('keywordEnum (keyword)', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'keyword');
      component.groups[0].rules[0].enumValue = 'shiny';

      expect(saveAndGetTerm()).toEqual({ kind: 'keyword', value: 'shiny' });
    });

    it('numericRange (numeric, exact value)', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'numeric');
      component.groups[0].rules[0].numericField = 'cp';
      component.groups[0].rules[0].numericExact = 1500;

      expect(saveAndGetTerm()).toEqual({ kind: 'numeric', field: 'cp', value: 1500 });
    });

    it('numericRange (numeric, min/max range)', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'numeric');
      component.groups[0].rules[0].numericField = 'cp';
      component.groups[0].rules[0].numericUseRange = true;
      component.groups[0].rules[0].numericMin = 1000;
      component.groups[0].rules[0].numericMax = 2000;

      expect(saveAndGetTerm()).toEqual({
        kind: 'numeric',
        field: 'cp',
        value: { min: 1000, max: 2000 },
      });
    });

    it('statRating', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'statRating');
      component.groups[0].rules[0].statRatingField = 'attack';
      component.groups[0].rules[0].statRatingValue = 3;

      expect(saveAndGetTerm()).toEqual({ kind: 'statRating', field: 'attack', value: 3 });
    });

    it('smallEnumNumber (buddyLevel)', () => {
      component.name = 'p';
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'buddyLevel');
      component.groups[0].rules[0].smallEnumValue = 4;

      expect(saveAndGetTerm()).toEqual({ kind: 'buddyLevel', value: 4 });
    });
  });

  describe('negated-tag-before-OR warning', () => {
    beforeEach(() => {
      routeId = 'new';
      setUp();
      component.ionViewWillEnter();
    });

    it('is false when a negated tag rule is only in the last group', () => {
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'tag');
      component.groups[0].rules[0].rule.negate = true;
      component.updatePreview();

      expect(component.hasUnsafeNegatedTagBeforeOr).toBe(false);
    });

    it('is true when a negated tag/hasTag rule exists in a non-final group', () => {
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'hasTag');
      component.groups[0].rules[0].rule.negate = true;
      component.addGroup();
      component.addRule(component.groups[1]);
      component.updatePreview();

      expect(component.hasUnsafeNegatedTagBeforeOr).toBe(true);
    });
  });

  describe('updatePreview with an incomplete numeric-range rule', () => {
    beforeEach(() => {
      routeId = 'new';
      setUp();
      component.ionViewWillEnter();
    });

    it('does not throw and falls back to null instead of crashing', () => {
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'numeric');
      component.groups[0].rules[0].numericUseRange = true;
      // Range checked but no min/max entered yet — the real transient state
      // right after checking the box, before typing a value.

      expect(() => {
        component.updatePreview();
      }).not.toThrow();
      expect(component.previewString).toBeNull();
    });

    it('still updates the negated-tag warning even when the compile step fails', () => {
      component.addRule(component.groups[0]);
      component.ruleKindChanged(component.groups[0].rules[0], 'numeric');
      component.groups[0].rules[0].numericUseRange = true;
      component.addGroup();
      component.addRule(component.groups[1]);
      component.ruleKindChanged(component.groups[1].rules[0], 'hasTag');
      component.groups[1].rules[0].rule.negate = true;
      component.addGroup();

      component.updatePreview();

      expect(component.previewString).toBeNull();
      expect(component.hasUnsafeNegatedTagBeforeOr).toBe(true);
    });
  });

  describe('save/cancel', () => {
    it('cancelClicked navigates back to the list without writing anything', () => {
      routeId = 'new';
      setUp();
      component.ionViewWillEnter();

      component.cancelClicked();

      expect(navigateSpy).toHaveBeenCalledWith(['/preset-queries']);
      expect(updateUserSettingsCalls).toHaveLength(0);
    });

    it('saveClicked appends a new preset and navigates back', () => {
      routeId = 'new';
      setUp();
      component.ionViewWillEnter();
      component.name = 'New Preset Name';

      component.saveClicked();

      expect(updateUserSettingsCalls[0].presetQueries).toHaveLength(2);
      expect(navigateSpy).toHaveBeenCalledWith(['/preset-queries']);
    });

    it('saveClicked replaces the existing preset by id in edit mode', () => {
      routeId = 'preset-1';
      setUp();
      component.ionViewWillEnter();
      component.name = 'Renamed';

      component.saveClicked();

      const saved = updateUserSettingsCalls[0].presetQueries;
      expect(saved).toHaveLength(1);
      expect(saved?.[0].name).toBe('Renamed');
      expect(saved?.[0].id).toBe('preset-1');
    });
  });
});
