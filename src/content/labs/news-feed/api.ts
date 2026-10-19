import type { ApiRequirement, Endpoint } from "../../../lib/lab/types";

const segments = (path: string) => path.split("/").filter(Boolean);
const params = (path: string) => segments(path).filter((s) => s.startsWith(":"));
const named = (fields: Endpoint["body"]) => fields.filter((f) => f.name.trim());
const has = (fields: Endpoint["body"], re: RegExp) => named(fields).some((f) => re.test(f.name));

export const API_REQUIREMENTS: ApiRequirement[] = [
  {
    id: "post",
    title: "Post a photo",
    story: "Neha shares a photo from the Saturday gig with a caption. Her followers should see it soon.",
    praise: "A POST to the collection, with a reference to the photo already in object storage. 201 and the new post's id.",
    hint: "Try POST /posts with { caption, photo_key }, answering 201 with { post_id }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "POST") p.push(`Creating a post is a POST, not a ${e.method}.`);
      if (params(e.path).length) p.push("The post has no id yet, so the path can't contain one. Post to the collection, like /posts.");
      if (!has(e.body, /photo|image|media|file|key/i)) p.push("Say which photo this post is about. The bytes go to object storage separately, so send its key (photo_key), not the picture.");
      if (e.body.some((f) => /photo|image/i.test(f.name) && f.type === "string" && /data|base64|bytes/i.test(f.name))) p.push("Don't send image bytes through the post endpoint; upload to storage and send the key.");
      if (e.status !== 201) p.push(`${e.status} isn't quite right: a post was created, so answer 201 Created.`);
      if (!has(e.response, /id/i)) p.push("Return the new post's id.");
      return p;
    },
  },
  {
    id: "feed",
    title: "Open the feed",
    story: "Karan opens the app on the metro and scrolls through photos from the 300 people he follows.",
    praise: "Cursor-based pagination: 'give me the next 20 after this post'. New posts arriving while he scrolls don't shift anything.",
    hint: "Try GET /feed with { cursor, limit: integer }, answering 200 with { posts: string, next_cursor: string }.",
    check: (e) => {
      const p: string[] = [];
      if (e.method !== "GET") p.push(`Reading is a GET, not a ${e.method}.`);
      if (params(e.path).length) p.push("A feed belongs to whoever is signed in. It doesn't need a user id in the path: /feed is enough.");
      if (has(e.body, /^(page|offset)$/i)) p.push("Page numbers and offsets break on a live feed: a new post arrives and every item shifts down, so Karan sees duplicates. Use a cursor.");
      else if (!has(e.body, /cursor|after|before|since|token/i)) p.push("Add a cursor so the app can ask for 'the next posts after this one'.");
      if (!has(e.body, /limit|size|count/i)) p.push("Let the client say how many posts it wants (limit), so slow phones can ask for fewer.");
      if (e.status !== 200) p.push(`Answer 200 OK; ${e.status} doesn't describe a successful read.`);
      if (!has(e.response, /post|items|data/i)) p.push("Return the posts.");
      if (!has(e.response, /next|cursor/i)) p.push("Return a next_cursor for the following request.");
      return p;
    },
  },
  {
    id: "follow",
    title: "Follow someone",
    story: "Karan taps Follow on Neha. Then, because the screen froze, he taps it again.",
    praise: "PUT is idempotent: following someone twice is the same as following once. Tapping twice does no harm.",
    hint: "Try PUT /users/:id/follow answering 204.",
    check: (e) => {
      const p: string[] = [];
      if (e.method === "GET") p.push("Following changes state, so it can't be a GET.");
      if (!params(e.path).length) p.push("Name who is being followed in the path, like /users/:id/follow.");
      if (e.method === "POST") p.push("POST works, but a double tap would create two follows unless you guard it. PUT says 'make it so that I follow them', which is safe to repeat.");
      if (e.method === "DELETE") p.push("DELETE is how you unfollow.");
      if (e.status === 201) p.push("Nothing needs to be returned. 204 No Content is lighter.");
      else if (e.status !== 204 && e.status !== 200) p.push(`${e.status} doesn't fit. Following has nothing to return: 204.`);
      return p;
    },
  },
];
