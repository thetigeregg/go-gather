const base = require('@thetigeregg/ncu-config');

const ANGULAR_MAJOR = 21;
const IONIC_MAJOR = 8;
const IONIC_ANGULAR_TOOLKIT_MAJOR = 12;

const isAngularPackage = (name) =>
  name.startsWith('@angular/') || name.startsWith('@angular-devkit/') || name === 'angular-eslint';

const isIonicAngularToolkitPackage = (name) => name === '@ionic/angular-toolkit';

const isIonicPackage = (name) => name.startsWith('@ionic/') && !isIonicAngularToolkitPackage(name);

module.exports = {
  ...base,
  target: (name) => {
    if (isAngularPackage(name) || isIonicPackage(name) || isIonicAngularToolkitPackage(name)) {
      return 'minor';
    }

    return base.target(name);
  },
  reject: (name) => name === 'typescript',
  filterResults: (packageName, { upgradedVersionSemver }) => {
    if (isAngularPackage(packageName)) {
      return parseInt(upgradedVersionSemver?.major, 10) === ANGULAR_MAJOR;
    }

    if (isIonicPackage(packageName)) {
      return parseInt(upgradedVersionSemver?.major, 10) === IONIC_MAJOR;
    }

    if (isIonicAngularToolkitPackage(packageName)) {
      return parseInt(upgradedVersionSemver?.major, 10) === IONIC_ANGULAR_TOOLKIT_MAJOR;
    }

    return true;
  },
};
