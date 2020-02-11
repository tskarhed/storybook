import { location, PREVIEW_URL } from 'global';
import {
  transformStoriesRawToStoriesHash,
  StoriesRaw,
  StoryInput,
  StoriesHash,
} from '../lib/stories';

import { Module } from '../index';

export interface SubState {
  refs: Record<string, InceptionRef & { data: StoriesHash }>;
}

export interface SubAPI {
  setRef: (id: string, stories: StoriesRaw) => void;
  getRefs: () => Record<RefId, RefUrl>;
}

export type Mapper = (ref: InceptionRef, story: StoryInput) => StoryInput;
export interface InceptionRef {
  id: string;
  url: string;
}

export type RefId = string;
export type RefUrl = string;

export const getSourceType = (source: string) => {
  const { origin, pathname } = location;

  if (source === origin || source === `${origin + pathname}iframe.html`) {
    return 'local';
  }
  return 'external';
};

export const defaultMapper: Mapper = (b, a) => {
  return { ...a, kind: `${b.id}/${a.kind.replace('|', '/')}` };
};

const namespace = (input: StoriesHash, ref: InceptionRef, options: {}): StoriesHash => {
  const output = {} as StoriesHash;
  Object.entries(input).forEach(([id, item]) => {
    if (item) {
      const mappedStoryId = `${ref.id}_${item.id}`;
      output[mappedStoryId] = {
        ...item,
        id: mappedStoryId,
        parent: `${ref.id}_${item.parent}`,
        knownAs: id, // this is used later to emit the correct commands over the channel
        ref, // this is used to know which iframe to emit the message to
      };
      if (item.children) {
        output[mappedStoryId].children = item.children.map((c: string) => `${ref.id}_${c}`);
      }
    }
  });
  return output;
};

const map = (input: StoriesRaw, ref: InceptionRef, options: { mapper?: Mapper }): StoriesRaw => {
  const output = {} as StoriesRaw;
  // map the incoming stories to a prefixed, non-conflicting version
  Object.entries(input).forEach(([unmappedStoryId, unmappedStoryInput]) => {
    const mapped = options.mapper ? options.mapper(ref, unmappedStoryInput) : unmappedStoryInput;

    if (mapped) {
      output[unmappedStoryId] = mapped;
    }
  });
  return output;
};

const initRefsApi = ({ store, provider }: Module) => {
  const getRefs: SubAPI['getRefs'] = () => {
    const { refs = {} }: { refs: Record<RefId, RefUrl>; mapper: Mapper } = provider.getConfig();

    return refs;
  };

  const setRef: SubAPI['setRef'] = (id, data) => {
    const url = getRefs()[id];
    const ref = { id, url };
    const after = namespace(
      transformStoriesRawToStoriesHash(map(data, ref, { mapper: defaultMapper }), {}, {}),
      ref,
      {}
    );

    store.setState({
      refs: {
        ...(store.getState().refs || {}),
        [id]: { id, url, data: after },
      },
    });
  };

  const initialState: SubState['refs'] = Object.entries(getRefs()).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: {
        id: key,
        url: value,
        data: {},
      },
    }),
    {}
  );

  return {
    api: {
      setRef,
      getRefs,
    },
    state: {
      refs: initialState,
    },
  };
};
export default initRefsApi;
