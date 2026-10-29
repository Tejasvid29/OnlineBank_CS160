// Web has no check capture screen (app/checks.jsx only shows guidance), so a deposit upload never starts here.
export function checkPhotoPart() {
  throw new Error('Check photos can only be uploaded from the mobile app.');
}
