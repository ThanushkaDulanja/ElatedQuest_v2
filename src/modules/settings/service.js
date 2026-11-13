export function createSettingsService(repository) {
  let settingsCache = null;
  return {
    async get() { if (!settingsCache) {settingsCache = await repository.readAll();} return settingsCache; },
    async update(values, actorId, ip) { await repository.save(values, actorId, ip); settingsCache = null; },
    async socialLinks() { return repository.readSocial(); },
    async menuItems() { return repository.readMenus(); },
    async updateSocial(items, actorId, ip) { await repository.saveSocial(items, actorId, ip); },
    async updateMenus(items, actorId, ip) { await repository.saveMenus(items, actorId, ip); },
  };
}
