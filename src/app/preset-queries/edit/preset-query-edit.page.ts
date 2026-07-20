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
import {
  TermCatalogEntry,
  TERM_CATALOG,
  getTermCatalogEntry,
} from '../../core/search-engine/search-term-catalog';
import { UserDataService } from '../../core/services/user-data.service';

/** Local editing shape for a numeric-range/statRating rule value, since a
 * pair of number inputs edits min/max separately before they're assembled
 * back into `SearchTermData`'s `{ min?, max? } | number` union on save. */
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
  numericMin: number | null;
  numericMax: number | null;
  numericUseRange: boolean;
  statRatingField: string;
  statRatingValue: number;
  smallEnumValue: number;
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
      return { kind: 'appraisalStars', value: catalogEntry.smallEnumRange?.min ?? 1 };
    case 'buddyLevel':
      return { kind: 'buddyLevel', value: catalogEntry.smallEnumRange?.min ?? 0 };
    case 'megaLevel':
      return { kind: 'megaLevel', value: catalogEntry.smallEnumRange?.min ?? 0 };
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
      if (typeof term.value === 'number') {
        editable.numericExact = term.value;
        editable.numericUseRange = false;
      } else {
        editable.numericMin = term.value.min ?? null;
        editable.numericMax = term.value.max ?? null;
        editable.numericUseRange = true;
      }
      break;
    case 'statRating':
      editable.statRatingField = term.field;
      editable.statRatingValue = term.value;
      break;
    case 'appraisalStars':
    case 'buddyLevel':
    case 'megaLevel':
      editable.smallEnumValue = term.value;
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
    numericMin: null,
    numericMax: null,
    numericUseRange: false,
    statRatingField: catalogEntry.fieldOptions?.[0] ?? '',
    statRatingValue: 0,
    smallEnumValue: catalogEntry.smallEnumRange?.min ?? 0,
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
        value: editable.numericUseRange
          ? {
              min: editable.numericMin ?? undefined,
              max: editable.numericMax ?? undefined,
            }
          : (editable.numericExact ?? 0),
      };
    case 'statRating':
      return {
        kind: 'statRating',
        field: editable.statRatingField,
        value: editable.statRatingValue,
      };
    case 'appraisalStars':
    case 'buddyLevel':
    case 'megaLevel':
      return { kind, value: editable.smallEnumValue };
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

    // A numeric-range rule with "Range" checked but no min/max entered yet
    // (e.g. immediately after checking the box, before typing a value) is a
    // real, momentarily-incomplete edit state — compilePresetQuery/the
    // serializer correctly rejects it rather than silently emitting a
    // meaningless query, but that means it throws instead of returning
    // null. Since this runs on every keystroke, treat a throw the same way
    // as "no compilable query yet" rather than letting it escape as an
    // uncaught error.
    try {
      this.previewString = compilePresetQuery(preset);
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
