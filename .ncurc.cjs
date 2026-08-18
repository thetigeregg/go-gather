const base = require('@thetigeregg/ncu-config');

const ANGULAR_MAJOR = 21;

const isAngularPackage = (name) =>
  name.startsWith('@angular/') || name.startsWith('@angular-devkit/') || name === 'angular-eslint';

module.exports = {
  ...base,
  target: (name) => {
    if (isAngularPackage(name)) {
      return 'minor';
    }

    return base.target(name);
  },
  reject: (name) => name === 'typescript',
  filterResults: (packageName, { upgradedVersionSemver }) => {
    if (!isAngularPackage(packageName)) {
      return true;
    }

    return parseInt(upgradedVersionSemver?.major, 10) === ANGULAR_MAJOR;
  },
};
