/* github-storage.js - GitHubストレージAPIユーティリティ
 * localStorageの代わりにGitHubリポジトリをストレージとして使用
 * storage.jsonの設定に基づいて動作
 */

(function() {
  'use strict';

  // 設定読み込み
  const STORAGE_CONFIG = {
    repo: 'cocoa-cn-mc/alpha-storage',
    apiBase: 'https://api.github.com/repos',
    rawBase: 'https://raw.githubusercontent.com/cocoa-cn-mc/alpha-storage/main',
    token: null // GitHub Actions Secretsから取得するか、環境変数で設定
  };

  // キャッシュ用
  const cache = new Map();
  const CACHE_DURATION = 5 * 60 * 1000; // 5分

  class GitHubStorage {
    constructor() {
      this.isInitialized = false;
      this.init();
    }

    async init() {
      try {
        // GitHubトークンの取得（環境変数または設定から）
        this.token = await this.getGitHubToken();
        this.isInitialized = true;
      } catch (error) {
        console.warn('GitHubストレージの初期化に失敗しました:', error);
        // フォールバックとしてlocalStorageを使用
        this.fallbackToLocalStorage = true;
      }
    }

    async getGitHubToken() {
      // GitHub Actions環境の場合は環境変数から取得
      if (typeof process !== 'undefined' && process.env.GITHUB_TOKEN) {
        return process.env.GITHUB_TOKEN;
      }
      
      // または設定ファイルから読み込み
      try {
        const response = await fetch('./storage.json');
        const config = await response.json();
        // 実際のデプロイ環境ではSecretsから取得
        return null; // ブラウザでは直接トークンを扱わない
      } catch (e) {
        return null;
      }
    }

    // GitHub APIヘッダー
    getHeaders() {
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      };
      
      if (this.token) {
        headers['Authorization'] = `token ${this.token}`;
      }
      
      return headers;
    }

    // ファイルパスを生成
    getFilePath(key) {
      return `data/${key}.json`;
    }

    // データ取得
    async getItem(key) {
      if (this.fallbackToLocalStorage) {
        return localStorage.getItem(key);
      }

      // キャッシュチェック
      const cached = cache.get(key);
      if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        return cached.data;
      }

      try {
        const filePath = this.getFilePath(key);
        const url = `${STORAGE_CONFIG.rawBase}/${filePath}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          if (response.status === 404) {
            return null; // ファイルが存在しない
          }
          throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.text();
        
        // キャッシュに保存
        cache.set(key, {
          data: data,
          timestamp: Date.now()
        });

        return data;
      } catch (error) {
        console.error('GitHubストレージからの取得に失敗:', error);
        // エラー時はlocalStorageを試す
        try {
          return localStorage.getItem(key);
        } catch (e) {
          return null;
        }
      }
    }

    // データ保存
    async setItem(key, value) {
      if (this.fallbackToLocalStorage) {
        return localStorage.setItem(key, value);
      }

      try {
        const filePath = this.getFilePath(key);
        const url = `${STORAGE_CONFIG.apiBase}/${STORAGE_CONFIG.repo}/contents/${filePath}`;
        
        const content = btoa(unescape(encodeURIComponent(value)));
        
        // まず既存ファイルの情報を取得
        let sha = null;
        try {
          const getResponse = await fetch(url, {
            headers: this.getHeaders()
          });
          
          if (getResponse.ok) {
            const fileInfo = await getResponse.json();
            sha = fileInfo.sha;
          }
        } catch (e) {
          // ファイルが存在しない場合は無視
        }

        // ファイル作成または更新
        const body = {
          message: `Update ${key}`,
          content: content
        };
        
        if (sha) {
          body.sha = sha;
        }

        const response = await fetch(url, {
          method: 'PUT',
          headers: this.getHeaders(),
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }

        // キャッシュを更新
        cache.set(key, {
          data: value,
          timestamp: Date.now()
        });

        // localStorageにもバックアップ
        try {
          localStorage.setItem(key, value);
        } catch (e) {
          // 無視
        }

        return true;
      } catch (error) {
        console.error('GitHubストレージへの保存に失敗:', error);
        // フォールバックとしてlocalStorageに保存
        try {
          localStorage.setItem(key, value);
          return true;
        } catch (e) {
          console.error('localStorageへの保存も失敗:', e);
          return false;
        }
      }
    }

    // データ削除
    async removeItem(key) {
      if (this.fallbackToLocalStorage) {
        return localStorage.removeItem(key);
      }

      try {
        const filePath = this.getFilePath(key);
        const url = `${STORAGE_CONFIG.apiBase}/${STORAGE_CONFIG.repo}/contents/${filePath}`;
        
        // ファイル情報を取得
        const getResponse = await fetch(url, {
          headers: this.getHeaders()
        });
        
        if (!getResponse.ok) {
          if (getResponse.status === 404) {
            return; // すでに存在しない
          }
          throw new Error(`GitHub API error: ${getResponse.status}`);
        }

        const fileInfo = await getResponse.json();
        
        // ファイル削除
        const response = await fetch(url, {
          method: 'DELETE',
          headers: this.getHeaders(),
          body: JSON.stringify({
            message: `Delete ${key}`,
            sha: fileInfo.sha
          })
        });

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }

        // キャッシュから削除
        cache.delete(key);

        // localStorageからも削除
        try {
          localStorage.removeItem(key);
        } catch (e) {
          // 無視
        }

        return true;
      } catch (error) {
        console.error('GitHubストレージからの削除に失敗:', error);
        // フォールバックとしてlocalStorageから削除
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.error('localStorageからの削除も失敗:', e);
        }
      }
    }

    // JSONデータの取得（便利メソッド）
    async getJSON(key) {
      const data = await this.getItem(key);
      if (!data) return null;
      
      try {
        return JSON.parse(data);
      } catch (e) {
        console.error('JSONパースに失敗:', e);
        return null;
      }
    }

    // JSONデータの保存（便利メソッド）
    async setJSON(key, obj) {
      try {
        const data = JSON.stringify(obj);
        return await this.setItem(key, data);
      } catch (e) {
        console.error('JSON文字列化に失敗:', e);
        return false;
      }
    }

    // ストレージイベントのエミュレート
    dispatchStorageEvent(key, oldValue, newValue) {
      try {
        window.dispatchEvent(new StorageEvent('storage', {
          key: key,
          oldValue: oldValue,
          newValue: newValue,
          storageArea: this
        }));
      } catch (e) {
        // 無視
      }
    }
  }

  // グローバルインスタンスを作成
  window.githubStorage = new GitHubStorage();

  // localStorage互換インターフェース
  window.githubStorageAPI = {
    async getItem(key) {
      return await window.githubStorage.getItem(key);
    },
    
    async setItem(key, value) {
      const oldValue = await window.githubStorage.getItem(key);
      const result = await window.githubStorage.setItem(key, value);
      if (result) {
        window.githubStorage.dispatchStorageEvent(key, oldValue, value);
      }
      return result;
    },
    
    async removeItem(key) {
      const oldValue = await window.githubStorage.getItem(key);
      await window.githubStorage.removeItem(key);
      window.githubStorage.dispatchStorageEvent(key, oldValue, null);
    },
    
    async getJSON(key) {
      return await window.githubStorage.getJSON(key);
    },
    
    async setJSON(key, obj) {
      const oldValue = await window.githubStorage.getItem(key);
      const result = await window.githubStorage.setJSON(key, obj);
      if (result) {
        const newValue = JSON.stringify(obj);
        window.githubStorage.dispatchStorageEvent(key, oldValue, newValue);
      }
      return result;
    }
  };

})();
