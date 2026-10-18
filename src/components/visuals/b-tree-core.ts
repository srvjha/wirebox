/**
 * A real B-tree of order m: every node holds at most m − 1 keys and m
 * children. Inserts go into a leaf; a node that overflows splits around its
 * middle key, which moves up into the parent. When the root splits, the tree
 * grows one level taller, which is the only way a B-tree ever gains height.
 */

export type BNode = { id: number; keys: number[]; children: BNode[] };

export type InsertReport = {
  path: number[]; // node ids visited on the way down
  splits: { promoted: number; left: number; right: number }[];
  grewTaller: boolean;
  duplicate: boolean;
};

export type BTree = { root: BNode; order: number; nextId: number; size: number };

export function emptyTree(order: number): BTree {
  return { root: { id: 1, keys: [], children: [] }, order, nextId: 2, size: 0 };
}

function clone(n: BNode): BNode {
  return { id: n.id, keys: [...n.keys], children: n.children.map(clone) };
}

const isLeaf = (n: BNode) => n.children.length === 0;

/** Index of the first key greater than `key` (the child to descend into). */
function slot(keys: number[], key: number) {
  let i = 0;
  while (i < keys.length && keys[i] < key) i++;
  return i;
}

export function insert(tree: BTree, key: number): { tree: BTree; report: InsertReport } {
  const root = clone(tree.root);
  let nextId = tree.nextId;
  const report: InsertReport = { path: [], splits: [], grewTaller: false, duplicate: false };

  function split(node: BNode): { mid: number; right: BNode } {
    const m = Math.floor(node.keys.length / 2);
    const mid = node.keys[m];
    const right: BNode = {
      id: nextId++,
      keys: node.keys.slice(m + 1),
      children: isLeaf(node) ? [] : node.children.slice(m + 1),
    };
    node.keys = node.keys.slice(0, m);
    if (!isLeaf(node)) node.children = node.children.slice(0, m + 1);
    report.splits.push({ promoted: mid, left: node.id, right: right.id });
    return { mid, right };
  }

  function rec(node: BNode): { mid: number; right: BNode } | null {
    report.path.push(node.id);
    const i = slot(node.keys, key);
    if (node.keys[i] === key) {
      report.duplicate = true;
      return null;
    }
    if (isLeaf(node)) {
      node.keys.splice(i, 0, key);
    } else {
      const up = rec(node.children[i]);
      if (up) {
        node.keys.splice(i, 0, up.mid);
        node.children.splice(i + 1, 0, up.right);
      }
    }
    return node.keys.length > tree.order - 1 ? split(node) : null;
  }

  const up = rec(root);
  let newRoot = root;
  if (up) {
    newRoot = { id: nextId++, keys: [up.mid], children: [root, up.right] };
    report.grewTaller = true;
  }
  return {
    tree: { root: newRoot, order: tree.order, nextId, size: tree.size + (report.duplicate ? 0 : 1) },
    report,
  };
}

export function search(tree: BTree, key: number): { path: number[]; found: boolean } {
  const path: number[] = [];
  let node: BNode | undefined = tree.root;
  while (node) {
    path.push(node.id);
    const i = slot(node.keys, key);
    if (node.keys[i] === key) return { path, found: true };
    node = isLeaf(node) ? undefined : node.children[i];
  }
  return { path, found: false };
}

export function height(tree: BTree): number {
  let h = 1;
  let n = tree.root;
  while (!isLeaf(n)) {
    n = n.children[0];
    h++;
  }
  return h;
}

export function countNodes(n: BNode): number {
  return 1 + n.children.reduce((s, c) => s + countNodes(c), 0);
}

export function build(order: number, keys: number[]): BTree {
  let t = emptyTree(order);
  for (const k of keys) t = insert(t, k).tree;
  return t;
}
