import { useCallback, useEffect, useState } from "react";
import * as api from "../../lib/api";
import type { Note } from "../../lib/api";

interface Options {
  noteId: string;
  /** 이동 전 편집 중이던 본문을 확정 저장한다 */
  flushBody: () => void;
  /** 커맨드가 돌려준 노트로 이 창을 전환 */
  switchTo: (n: Note, dir: "next" | "prev") => void;
  setNote: React.Dispatch<React.SetStateAction<Note | null>>;
}

/**
 * 모음집(그룹) 내 이동 — 멤버 목록과 이전/다음·점프·팝아웃.
 *
 * 어떤 커맨드든 `null`을 돌려주면 "대상이 이미 다른 창에 열려 있어 그 창을
 * 포커스했다"는 뜻이므로 이 창은 그대로 둔다.
 */
export function useGroupNavigation({ noteId, flushBody, switchTo, setNote }: Options) {
  const [members, setMembers] = useState<string[]>([]);

  // 멤버 목록은 다른 창의 변경·드래그 병합으로도 바뀐다 — 이벤트로 함께 갱신
  useEffect(() => {
    let un: (() => void) | null = null;
    const refresh = () => {
      api
        .listNotes()
        .then((all) => {
          const n = all.find((x) => x.meta.id === noteId);
          if (!n) return;
          setNote((prev) => (prev ? { ...prev, meta: n.meta } : prev));
          if (n.meta.group)
            api
              .groupMembers(noteId)
              .then(setMembers)
              .catch(() => {});
          else setMembers([]);
        })
        .catch(() => {});
    };
    refresh();
    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("groups-changed", refresh).then((f) => {
          un = f;
        }),
      )
      .catch(() => {});
    return () => {
      if (un) un();
    };
  }, [noteId, setNote]);

  const navigate = useCallback(
    (dir: 1 | -1) => {
      flushBody();
      api
        .navGroup(dir)
        .then((n) => {
          if (n) switchTo(n, dir === 1 ? "next" : "prev");
        })
        .catch(() => {});
    },
    [flushBody, switchTo],
  );

  const jumpTo = useCallback(
    (id: string, dirHint: "next" | "prev") => {
      flushBody();
      api
        .navTo(id)
        .then((n) => {
          if (n) switchTo(n, dirHint);
        })
        .catch(() => {});
    },
    [flushBody, switchTo],
  );

  // 현재 메모가 새 창으로 나가고, 이 창은 다음 멤버로 전환된다 (#74)
  const popOut = useCallback(() => {
    flushBody();
    api
      .popOut()
      .then((n) => {
        if (n) switchTo(n, "next");
      })
      .catch(() => {});
  }, [flushBody, switchTo]);

  return { members, navigate, jumpTo, popOut };
}

/**
 * 숨기기 두 갈래 — 브라우저의 탭/창 관계와 같다.
 *   이 장만(Ctrl+W)      : 모음집이면 창은 남고 다음 장으로, 아니면 창까지 내려간다
 *   창 전체(Ctrl+Shift+W): 모음집 멤버 전부를 숨기고 창을 내린다
 * 숨긴 노트는 파일도 목록도 그대로 — 목록에서 열면 돌아온다.
 */
export function useHide({ flushBody, switchTo }: Pick<Options, "flushBody" | "switchTo">): {
  hideNote: () => void;
  hideWindow: () => void;
} {
  const closeWindow = useCallback(async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  }, []);

  const hideNote = useCallback(() => {
    flushBody();
    api
      .hideNote()
      .then((n) => {
        // 전환할 장이 없으면(단독 노트) 창까지 내려간다
        if (n) switchTo(n, "next");
        else void closeWindow();
      })
      .catch(() => {});
  }, [closeWindow, flushBody, switchTo]);

  const hideWindow = useCallback(() => {
    flushBody();
    api
      .hideGroup()
      .catch(() => {})
      .finally(() => void closeWindow());
  }, [closeWindow, flushBody]);

  return { hideNote, hideWindow };
}
