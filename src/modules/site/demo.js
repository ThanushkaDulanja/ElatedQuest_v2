export function assertDemoDatabase({ nodeEnv, databaseName, testDatabaseName }) {
  if (nodeEnv === "production") { throw new Error("Demo data scripts are disabled in production."); }
  if (databaseName === testDatabaseName) { throw new Error("Demo data scripts cannot run against DB_TEST_NAME."); }
  if (databaseName !== "elatedquest") { throw new Error("Demo data scripts require the development database named elatedquest."); }
}

const topics = ["field-notes", "wildlife", "photography", "weekend-guides", "conservation"];
const demoStories = [
  ["A quiet morning along the forest trail", "Follow a dawn walk through a misty woodland and learn what to notice along the path.", "dawn, forest, birdsong, field notes"],
  ["Photographing birds in soft morning light", "Simple field techniques for sharp, natural bird photographs without disturbing wildlife.", "birds, photography, light, wildlife"],
  ["A weekend guide to the coastal wetlands", "Plan an easy two day visit with walking routes, viewing points, and a low impact packing list.", "coast, wetlands, weekend guide, conservation"],
  ["What the monsoon leaves behind", "Small signs in the soil and plants reveal how a rainy week reshapes a familiar trail.", "monsoon, plants, field notes"],
  ["Building a simple backyard pollinator garden", "Choose native flowers and create a welcoming space for butterflies and bees.", "garden, pollinators, conservation, plants"],
  ["Tracking animal footprints after rain", "A practical guide to reading tracks and other clues while leaving the habitat undisturbed.", "tracks, wildlife, field notes"],
  ["Five waterfall walks for a slow afternoon", "These short routes make room for a picnic, a camera, and a more relaxed pace outdoors.", "waterfalls, walking, weekend guide"],
  ["Choosing a lightweight camera for hikes", "Compare a few useful camera features for carrying less and making better trail photographs.", "photography, cameras, hiking"],
  ["Restoring a small stream bank", "Volunteers share how native plants help protect a local stream and support nearby wildlife.", "stream, restoration, conservation, plants"],
  ["A field notebook for beginners", "Keep useful observations with a few repeatable notes about weather, place, and species.", "field notes, beginner guide, wildlife"],
  ["How to watch butterflies without chasing them", "Find sunny edges and flowering plants for calm, close observation through the season.", "butterflies, wildlife, photography"],
  ["Packing for a family nature walk", "A short checklist keeps a family outing comfortable while avoiding unnecessary gear.", "family, walking, weekend guide"],
  ["The changing colors of a forest canopy", "Notice how leaf shape, light, and season create a different view from the same trail.", "forest, photography, plants"],
  ["Leave no trace on a busy trail", "Small choices around waste, noise, and trail edges help protect popular outdoor places.", "trails, conservation, hiking, field notes"],
];

function mysqlUtc(date) { return date.toISOString().slice(0, 19).replace("T", " "); }

export async function seedDemoPosts(repository, now = new Date()) {
  const categoryNames = ["Demo Outdoors", "Demo Photography", "Demo Wildlife", "Demo Guides"];
  const categoryIds = await Promise.all(categoryNames.map((name, index) => repository.saveCategory(name, `demo-category-${index + 1}`, 900 + index)));
  const authorIds = await Promise.all([
    repository.saveAuthor("Demo Writer", "demo-writer", false),
    repository.saveAuthor("Demo Guest", "demo-guest", true),
  ]);
  const tagIds = await Promise.all(topics.map((topic) => repository.saveTag(topic.replaceAll("-", " "), `demo-tag-${topic}`)));
  for (let index = 0; index < 14; index += 1) {
    const number = String(index + 1).padStart(2, "0");
    const [title, excerpt, body] = demoStories[index];
    const viewCount = index % 3 === 0 ? 25 + index * 7 : 0;
    const published = new Date(now.getTime() - Math.round(index * 60 / 13) * 24 * 60 * 60 * 1000);
    const sampleTags = [tagIds[index % tagIds.length], tagIds[(index + 1) % tagIds.length], tagIds[(index + 2) % tagIds.length]];
    if (index % 2 === 0) { sampleTags.push(tagIds[(index + 3) % tagIds.length]); }
    if (index % 5 === 0) { sampleTags.push(tagIds[(index + 4) % tagIds.length]); }
    await repository.savePost({
      title, slug: `demo-story-${number}`,
      excerpt,
      contentHtml: `<p>${excerpt}</p><p>${body}. This sample story helps exercise public article layouts, related stories, and search results.</p>`,
      contentText: `${excerpt} ${body}. This sample story helps exercise public article layouts, related stories, and search results.`,
      categoryId: categoryIds[index % categoryIds.length], authorId: authorIds[index % authorIds.length],
      publishedAt: mysqlUtc(published), readingMinutes: 3 + index % 6, featured: index < 4,
      editorPick: index % 5 === 0, viewCount, viewDay: mysqlUtc(new Date(now.getTime() - (index % 7) * 24 * 60 * 60 * 1000)).slice(0, 10), tagIds: [...new Set(sampleTags)],
    });
  }
  return 14;
}

export async function cleanDemoPosts(repository) { await repository.removeDemoPosts(); }
