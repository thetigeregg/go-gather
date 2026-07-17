import { or, term } from './search-query.model';
import { SearchQueryBuilder } from './search-query.builder';

describe('SearchQueryBuilder', () => {
  it('isEmpty is true for a fresh builder', () => {
    expect(new SearchQueryBuilder().isEmpty()).toBe(true);
  });

  it('build returns null when no terms were added', () => {
    expect(new SearchQueryBuilder().build()).toBeNull();
  });

  it('add appends a term, joined with &', () => {
    const query = new SearchQueryBuilder()
      .add({ kind: 'keyword', value: 'shiny' })
      .add({ kind: 'keyword', value: 'legendary' })
      .build();

    expect(query).toBe('shiny&legendary');
  });

  it('addNegated appends a negated term', () => {
    const query = new SearchQueryBuilder()
      .add({ kind: 'keyword', value: 'shiny' })
      .addNegated({ kind: 'keyword', value: 'costume' })
      .build();

    expect(query).toBe('shiny&!costume');
  });

  it('addNode appends a fully-formed node as-is', () => {
    const orNode = or(
      term({ kind: 'name', value: 'pikachu' }),
      term({ kind: 'name', value: 'raichu' })
    );

    const query = new SearchQueryBuilder()
      .addNegated({ kind: 'keyword', value: 'shiny' })
      .addNode(orNode)
      .build();

    expect(query).toBe('!shiny&pikachu,raichu');
  });

  it('isEmpty is false once a term has been added', () => {
    const builder = new SearchQueryBuilder().add({ kind: 'keyword', value: 'shiny' });
    expect(builder.isEmpty()).toBe(false);
  });
});
