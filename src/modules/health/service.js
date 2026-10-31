export function createHealthService(repository) {
  return {
    async check() {
      await repository.checkDatabase();
    },
  };
}
