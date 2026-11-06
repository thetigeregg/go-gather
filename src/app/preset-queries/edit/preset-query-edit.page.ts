import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonButtons,
  IonBackButton,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonCheckbox,
  IonToggle,
  IonIcon,
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trash } from 'ionicons/icons';
import { PresetQuery, PresetQueryGroup, PresetQueryRule, SearchTermData } from '@go-gather/shared';
import { compilePresetQuery } from '../../core/search-engine/preset-query.compiler';
import { RangeValue } from '../../core/search-engine/search-query.model';
import {
  TermCatalogEntry,
  TermInputKind,
  TERM_CATALOG,
  getTermCatalogEntry,
} from '../../core/search-engine/search-term-catalog';
import { UserDataService } from '../../core/services/user-data.service';

/** Local editing shape for a rule's value. Range-capable kinds (numeric,
 * statRating, buddyLevel, megaLevel) share one `useRange`/`rangeMin`/
 * `rangeMax` set, since a pair of number inputs edits min/max separately
 * before they're assembled back into `SearchTermData`'s
 * `{ min?, max? } | number` union on save. */
interface EditableRule {
  rule: PresetQueryRule;
  catalogEntry: TermCatalogEntry;
  /** Independently selectable so a user can switch category first (to see a
   * different set of kinds to pick from) without that alone changing the
   * rule's actual term — only picking a kind via `ruleKindChanged` does. */
  selectedCategory: string;
  freeTextValue: string;
  enumValue: string;
  numericField: string;
  numericExact: number | null;
  useRange: boolean;
  rangeMin: number | null;
  rangeMax: number | null;
  statRatingField: string;
  /** `null` when the user clears the input (Ionic's number accessor maps an
   * empty `ion-input type="number"` to null). */
  statRatingValue: number | null;
  smallEnumValue: number | null;
}

interface EditableGroup {
  group: PresetQueryGroup;
  rules: EditableRule[];
}

function newId(): string {
  return crypto.randomUUID();
}

function defaultValueForCatalogEntry(catalogEntry: TermCatalogEntry): SearchTermData {
  switch (catalogEntry.kind) {
    case 'weather':
      return { kind: 'weather' };
    case 'special':
      return { kind: 'special' };
    case 'tag':
      return { kind: 'tag', value: '' };
    case 'hasTag':
      return { kind: 'hasTag' };
    case 'region':
      return { kind: 'region', value: catalogEntry.enumOptions?.[0] ?? '' };
    case 'keyword':
      return { kind: 'keyword', value: catalogEntry.enumOptions?.[0] ?? '' };
    case 'gender':
      return { kind: 'gender', value: catalogEntry.enumOptions?.[0] ?? '' };
    case 'size':
      return { kind: 'size', value: catalogEntry.enumOptions?.[0] ?? '' };
    case 'raidOrigin':
      return { kind: 'raidOrigin', value: catalogEntry.enumOptions?.[0] ?? '' };
    case 'numeric':
      return { kind: 'numeric', field: catalogEntry.fieldOptions?.[0] ?? 'cp', value: 0 };
    case 'statRating':
      return { kind: 'statRating', field: catalogEntry.fieldOptions?.[0] ?? 'hp', value: 0 };
    case 'appraisalStars':
      return { kind: 'appraisalStars', value: catalogEntry.valueBounds?.min ?? 0 };
    case 'buddyLevel':
      return { kind: 'buddyLevel', value: catalogEntry.valueBounds?.min ?? 0 };
    case 'megaLevel':
      return { kind: 'megaLevel', value: catalogEntry.valueBounds?.min ?? 0 };
    case 'name':
      return { kind: 'name', value: '' };
    case 'family':
      return { kind: 'family', value: '' };
    case 'nickname':
      return { kind: 'nickname', value: '' };
    case 'type':
      return { kind: 'type', value: catalogEntry.enumOptions?.[0] ?? '' };
    case 'move':
      return { kind: 'move', value: '' };
    case 'moveType':
      return { kind: 'moveType', value: catalogEntry.enumOptions?.[0] ?? '' };
    case 'fastMoveType':
      return { kind: 'fastMoveType', value: '' };
    case 'chargedMoveType':
      return { kind: 'chargedMoveType', value: '' };
    case 'secondChargedMoveType':
      return { kind: 'secondChargedMoveType', value: '' };
    case 'weakAgainst':
      return { kind: 'weakAgainst', value: catalogEntry.enumOptions?.[0] ?? '' };
    case 'superEffectiveAgainst':
      return { kind: 'superEffectiveAgainst', value: catalogEntry.enumOptions?.[0] ?? '' };
    case 'raw':
      return { kind: 'raw', value: '' };
  }
}

/** Loads an exact-or-range value into the editor: an exact value goes
 * through `setExact`, a range into the shared `rangeMin`/`rangeMax`.
 *
 * `null` is accepted because presets saved before range support could store
 * a cleared Stat Rating/Buddy/Mega input as `value: null`. It loads as a
 * blank exact value, so the rule's "Enter a value." error shows and the
 * preset can be reopened and repaired instead of throwing on `null.min`. */
function applyRangeOrExact(
  editable: EditableRule,
  value: RangeValue<number> | null,
  setExact: (exact: number | null) => void
): void {
  if (value === null || typeof value === 'number') {
    setExact(value);
    editable.useRange = false;
  } else {
    editable.rangeMin = value.min ?? null;
    editable.rangeMax = value.max ?? null;
    editable.useRange = true;
  }
}

/** The inverse of `applyRangeOrExact`: the edited range when "Range" is
 * checked, otherwise `exact`. */
function rangeOrExact(editable: EditableRule, exact: number): RangeValue<number> {
  return isRangeMode(editable)
    ? { min: editable.rangeMin ?? undefined, max: editable.rangeMax ?? undefined }
    : exact;
}

/** Input kinds whose value is typed into a number input. */
const NUMBER_INPUT_KINDS: ReadonlySet<TermInputKind> = new Set([
  'numericRange',
  'statRating',
  'smallEnumNumber',
]);

/** Whether the rule is edited as a min/max range: its kind offers a Range
 * toggle (the `numericRange` input kind always does; others opt in via
 * `supportsRange`) and the toggle is on. */
function isRangeMode(editable: EditableRule): boolean {
  const { inputKind, supportsRange } = editable.catalogEntry;
  return editable.useRange && (inputKind === 'numericRange' || supportsRange === true);
}

/** The rule's exact-value input, for number input kinds. */
function exactValue(editable: EditableRule): number | null {
  switch (editable.catalogEntry.inputKind) {
    case 'numericRange':
      return editable.numericExact;
    case 'statRating':
      return editable.statRatingValue;
    case 'smallEnumNumber':
      return editable.smallEnumValue;
    default:
      return null;
  }
}

function isWithinBounds(value: number, bounds: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

/** Why a rule's value can't be saved as-is, or null when it's valid. Covers
 * what the inputs' `[min]`/`[max]` attributes don't enforce: an empty value,
 * an empty or reversed range, and out-of-bounds or fractional values for
 * bounded kinds (stat rating, buddy/mega level, appraisal stars). */
function ruleValueError(editable: EditableRule): string | null {
  if (!NUMBER_INPUT_KINDS.has(editable.catalogEntry.inputKind)) {
    return null;
  }

  const bounds = editable.catalogEntry.valueBounds;
  const boundsText = bounds ? `${String(bounds.min)} to ${String(bounds.max)}` : '';

  if (isRangeMode(editable)) {
    const { rangeMin: min, rangeMax: max } = editable;

    if (min === null && max === null) {
      return 'Enter a min, a max, or both.';
    }

    if (bounds && [min, max].some((value) => value !== null && !isWithinBounds(value, bounds))) {
      return `Min and max must be whole numbers from ${boundsText}.`;
    }

    if (min !== null && max !== null && min > max) {
      return 'Min must not be greater than max.';
    }

    return null;
  }

  const exact = exactValue(editable);

  if (exact === null) {
    return 'Enter a value.';
  }

  if (bounds && !isWithinBounds(exact, bounds)) {
    return `Value must be a whole number from ${boundsText}.`;
  }

  return null;
}

/** Writes `term`'s value onto an already-constructed `EditableRule`'s
 * form-field properties (freeTextValue, enumValue, numeric fields, etc). */
function applyTermValue(editable: EditableRule, term: SearchTermData): void {
  switch (term.kind) {
    case 'name':
    case 'family':
    case 'nickname':
    case 'tag':
    case 'move':
    case 'fastMoveType':
    case 'chargedMoveType':
    case 'secondChargedMoveType':
    case 'raw':
      editable.freeTextValue = term.value;
      break;
    case 'region':
    case 'keyword':
    case 'gender':
    case 'size':
    case 'raidOrigin':
    case 'type':
    case 'moveType':
    case 'weakAgainst':
    case 'superEffectiveAgainst':
      // These 4 share the same `inputKind: 'enum'` (a Pokemon-type picker,
      // see search-term-catalog.ts) and are bound to `enumValue` in the
      // template — pre-existing go-gather-next bug (carried over verbatim
      // during the port) routed them through `freeTextValue` instead, which
      // the enum <ion-select> never reads, silently discarding the picked
      // type on save.
      editable.enumValue = term.value;
      break;
    case 'numeric':
      editable.numericField = term.field;
      applyRangeOrExact(editable, term.value, (exact) => {
        editable.numericExact = exact;
      });
      break;
    case 'statRating':
      editable.statRatingField = term.field;
      applyRangeOrExact(editable, term.value, (exact) => {
        editable.statRatingValue = exact;
      });
      break;
    case 'appraisalStars':
      editable.smallEnumValue = term.value;
      break;
    case 'buddyLevel':
    case 'megaLevel':
      applyRangeOrExact(editable, term.value, (exact) => {
        editable.smallEnumValue = exact;
      });
      break;
    case 'weather':
    case 'special':
    case 'hasTag':
      break;
  }
}

function toEditableRule(rule: PresetQueryRule): EditableRule {
  const catalogEntry = getTermCatalogEntry(rule.term.kind);

  const editable: EditableRule = {
    rule,
    catalogEntry,
    selectedCategory: catalogEntry.category,
    freeTextValue: '',
    enumValue: '',
    numericField: catalogEntry.fieldOptions?.[0] ?? '',
    numericExact: null,
    useRange: false,
    rangeMin: null,
    rangeMax: null,
    statRatingField: catalogEntry.fieldOptions?.[0] ?? '',
    statRatingValue: 0,
    smallEnumValue: catalogEntry.valueBounds?.min ?? 0,
  };

  applyTermValue(editable, rule.term);

  return editable;
}

/** Assembles the current edit-form fields back into a `SearchTermData`,
 * matching the kind stored on `editable.catalogEntry`. */
function toSearchTermData(editable: EditableRule): SearchTermData {
  const kind = editable.catalogEntry.kind;

  switch (kind) {
    case 'name':
    case 'family':
    case 'nickname':
    case 'tag':
    case 'move':
    case 'fastMoveType':
    case 'chargedMoveType':
    case 'secondChargedMoveType':
    case 'raw':
      return { kind, value: editable.freeTextValue };
    case 'region':
    case 'keyword':
    case 'gender':
    case 'size':
    case 'raidOrigin':
    case 'type':
    case 'moveType':
    case 'weakAgainst':
    case 'superEffectiveAgainst':
      return { kind, value: editable.enumValue };
    case 'numeric':
      return {
        kind: 'numeric',
        field: editable.numericField,
        value: rangeOrExact(editable, editable.numericExact ?? 0),
      };
    case 'statRating':
      return {
        kind: 'statRating',
        field: editable.statRatingField,
        value: rangeOrExact(editable, editable.statRatingValue ?? 0),
      };
    case 'appraisalStars':
      return { kind, value: editable.smallEnumValue ?? 0 };
    case 'buddyLevel':
    case 'megaLevel':
      return { kind, value: rangeOrExact(editable, editable.smallEnumValue ?? 0) };
    case 'weather':
      return { kind: 'weather' };
    case 'special':
      return { kind: 'special' };
    case 'hasTag':
      return { kind: 'hasTag' };
  }
}

@Component({
  selector: 'app-preset-query-edit',
  templateUrl: 'preset-query-edit.page.html',
  styleUrls: ['preset-query-edit.page.scss'],
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonButtons,
    IonBackButton,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonCheckbox,
    IonToggle,
    IonIcon,
  ],
})
export class PresetQueryEditPage implements ViewWillEnter {
  private readonly userDataService = inject(UserDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly termCatalog = TERM_CATALOG;
  readonly termCategories = [...new Set(TERM_CATALOG.map((entry) => entry.category))];

  private preset: PresetQuery | null = null;
  name = '';
  groups: EditableGroup[] = [];
  userTags: string[] = [];
  previewString: string | null = null;
  /** Empirically confirmed in-game: a negated tag (`!#...`) anywhere before
   * a comma breaks the comma's OR-split — everything after that comma gets
   * ignored, even though the string's own precedence rules (comma binds
   * looser than &) say it shouldn't. Only the LAST group is safe to contain
   * a negated tag; this flag warns when an earlier one does. */
  hasUnsafeNegatedTagBeforeOr = false;
  /** True while any rule has a `ruleValueError`; disables Save. */
  hasInvalidRules = false;

  constructor() {
    addIcons({ trash });
  }

  ionViewWillEnter(): void {
    const id = this.route.snapshot.paramMap.get('id');
    const userSettings = this.userDataService.getUserSettings();

    this.userTags = userSettings.userTags;
    this.preset =
      id === 'new' ? null : (userSettings.presetQueries.find((p) => p.id === id) ?? null);

    if (this.preset) {
      this.name = this.preset.name;
      this.groups = this.preset.groups.map((group) => ({
        group,
        rules: group.rules.map((rule) => toEditableRule(rule)),
      }));
    } else {
      this.name = '';
      this.groups = [{ group: { id: newId(), rules: [] }, rules: [] }];
    }

    this.updatePreview();
  }

  get pageTitle(): string {
    return this.preset ? 'Edit Preset' : 'New Preset';
  }

  termsForCategory(category: string): TermCatalogEntry[] {
    return this.termCatalog.filter((entry) => entry.category === category);
  }

  /** Label for a bounded number input, suffixed with the kind's inclusive
   * bounds, e.g. "Min (0-5)". */
  boundedLabel(prefix: string, rule: EditableRule): string {
    const bounds = rule.catalogEntry.valueBounds;
    return bounds ? `${prefix} (${String(bounds.min)}-${String(bounds.max)})` : prefix;
  }

  isRangeMode(rule: EditableRule): boolean {
    return isRangeMode(rule);
  }

  ruleValueError(rule: EditableRule): string | null {
    return ruleValueError(rule);
  }

  /** Seeds an empty range from the current exact value when "Range" is
   * ticked, so the preview keeps matching what the user had (e.g. `3attack`
   * becomes `3-3attack`) instead of going blank until both bounds are typed. */
  rangeToggled(rule: EditableRule): void {
    const exact = exactValue(rule);

    if (rule.useRange && rule.rangeMin === null && rule.rangeMax === null && exact !== null) {
      rule.rangeMin = exact;
      rule.rangeMax = exact;
    }

    this.updatePreview();
  }

  addGroup(): void {
    this.groups.push({ group: { id: newId(), rules: [] }, rules: [] });
    this.updatePreview();
  }

  removeGroup(group: EditableGroup): void {
    this.groups = this.groups.filter((candidate) => candidate !== group);
    this.updatePreview();
  }

  addRule(group: EditableGroup): void {
    const catalogEntry = this.termCatalog[0];
    const term = defaultValueForCatalogEntry(catalogEntry);
    const rule: PresetQueryRule = { id: newId(), term, negate: false };

    group.rules.push(toEditableRule(rule));
    this.updatePreview();
  }

  removeRule(group: EditableGroup, rule: EditableRule): void {
    group.rules = group.rules.filter((candidate) => candidate !== rule);
    this.updatePreview();
  }

  ruleCategoryChanged(rule: EditableRule, category: string): void {
    rule.selectedCategory = category;

    // Guards against resetting the rule's term/value when this fires with
    // the rule's own current category (e.g. a spurious re-emit during
    // initial render) — only actually switching category should reset the
    // term to that category's first kind.
    if (category === rule.catalogEntry.category) {
      return;
    }

    const firstKindInCategory = this.termsForCategory(category)[0];
    this.ruleKindChanged(rule, firstKindInCategory.kind);
  }

  ruleKindChanged(rule: EditableRule, kind: SearchTermData['kind']): void {
    // Guards against resetting the rule's value when this fires with the
    // rule's own current kind (see `ruleCategoryChanged`'s comment).
    if (kind === rule.catalogEntry.kind) {
      return;
    }

    const catalogEntry = getTermCatalogEntry(kind);
    const term = defaultValueForCatalogEntry(catalogEntry);
    const replacement = toEditableRule({ id: rule.rule.id, term, negate: rule.rule.negate });

    Object.assign(rule, replacement);
    this.updatePreview();
  }

  updatePreview(): void {
    const preset = this.buildPresetQuery();

    this.hasInvalidRules = this.anyRuleInvalid();

    // An invalid rule (see `ruleValueError`) would otherwise preview a
    // fallback value (e.g. a cleared Buddy Level showing `buddy0`) that Save
    // won't accept, or make the serializer throw (e.g. "Range" checked with
    // no min/max yet), so show no preview until it's fixed.
    //
    // The catch is a backstop for any serializer rejection validation
    // doesn't anticipate: this runs on every keystroke, so treat a throw as
    // "no compilable query yet" rather than letting it escape uncaught.
    try {
      this.previewString = this.hasInvalidRules ? null : compilePresetQuery(preset);
    } catch {
      this.previewString = null;
    }

    // Only groups before the last one matter — a negated tag in the final
    // group has no comma after it to break.
    const nonFinalGroups = this.groups.slice(0, -1);
    this.hasUnsafeNegatedTagBeforeOr = nonFinalGroups.some((editableGroup) =>
      editableGroup.rules.some(
        (rule) =>
          rule.rule.negate &&
          (rule.catalogEntry.kind === 'tag' || rule.catalogEntry.kind === 'hasTag')
      )
    );
  }

  saveClicked(): void {
    // The Save button is disabled in this state; re-check here rather than
    // trusting the cached flag, so an invalid rule can never be persisted as
    // an uncompilable preset.
    if (this.anyRuleInvalid()) {
      return;
    }

    const preset = this.buildPresetQuery();
    const userSettings = this.userDataService.getUserSettings();
    const existingIndex = userSettings.presetQueries.findIndex(
      (candidate) => candidate.id === preset.id
    );

    const presetQueries =
      existingIndex === -1
        ? [...userSettings.presetQueries, preset]
        : userSettings.presetQueries.map((candidate) =>
            candidate.id === preset.id ? preset : candidate
          );

    this.userDataService.updateUserSettings({ presetQueries });
    void this.router.navigate(['/preset-queries']);
  }

  private anyRuleInvalid(): boolean {
    return this.groups.some((editableGroup) =>
      editableGroup.rules.some((rule) => ruleValueError(rule) !== null)
    );
  }

  private buildPresetQuery(): PresetQuery {
    return {
      id: this.preset?.id ?? newId(),
      name: this.name,
      groups: this.groups.map((editableGroup) => ({
        id: editableGroup.group.id,
        rules: editableGroup.rules.map((editableRule) => ({
          id: editableRule.rule.id,
          term: toSearchTermData(editableRule),
          negate: editableRule.rule.negate,
        })),
      })),
    };
  }
}
