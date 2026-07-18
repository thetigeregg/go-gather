// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- verbatim port from go-gather-next, whose config doesn't enforce this rule
export class GeneralUtil {
  static capitalizeFirstLetter(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
