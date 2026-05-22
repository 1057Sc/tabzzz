declare const chrome: any;

declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      tab?: tabs.Tab;
      frameId?: number;
      id?: string;
      url?: string;
      origin?: string;
    }
  }

  namespace tabs {
    interface Tab {
      id?: number;
      windowId: number;
      index: number;
      active: boolean;
      pinned: boolean;
      audible?: boolean;
      discarded?: boolean;
      groupId?: number;
      url?: string;
      title?: string;
      favIconUrl?: string;
    }
  }
}
