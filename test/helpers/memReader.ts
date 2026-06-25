/**
 * In-memory {@link DirReader} for tests — synthesizes a directory tree from a
 * flat list of file specs, so the pure walker can be exercised without a real FS.
 */
import { DirChild, DirReader } from '../../src/fs/types';

export interface FileSpec {
  path: string;
  size?: number;
  content?: string;
}

export class MemReader implements DirReader {
  private files = new Map<string, { size: number; content?: string }>();

  constructor(specs: FileSpec[]) {
    for (const spec of specs) {
      this.files.set(spec.path, { size: spec.size ?? 0, content: spec.content });
    }
  }

  async readDir(relativePath: string): Promise<DirChild[]> {
    const base = relativePath === '' ? '' : `${relativePath}/`;
    const children = new Map<string, DirChild>();
    for (const [path, meta] of this.files) {
      if (base !== '' && !path.startsWith(base)) {
        continue;
      }
      const rest = path.slice(base.length);
      if (rest === '') {
        continue;
      }
      const slash = rest.indexOf('/');
      if (slash === -1) {
        children.set(rest, { name: rest, isDirectory: false, size: meta.size });
      } else {
        const dirName = rest.slice(0, slash);
        if (!children.has(dirName)) {
          children.set(dirName, { name: dirName, isDirectory: true, size: 0 });
        }
      }
    }
    return [...children.values()];
  }

  async readTextFile(relativePath: string): Promise<string | undefined> {
    return this.files.get(relativePath)?.content;
  }
}
