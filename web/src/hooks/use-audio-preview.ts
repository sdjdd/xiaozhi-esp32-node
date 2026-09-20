import { useEffect, useRef, useState } from 'react';

/**
 * 单实例试听播放：同一时刻只播一个，再次触发同一项则停止。
 * key 用于标识当前播放项（如音色代码），url 为 CDN 试听地址
 */
export function useAudioPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function toggle(key: string, url: string) {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.onended = () => setPlayingKey(null);
      audio.onerror = () => setPlayingKey(null);
      audioRef.current = audio;
    }
    if (playingKey === key) {
      audio.pause();
      setPlayingKey(null);
      return;
    }
    audio.setAttribute('src', url);
    audio
      .play()
      .then(() => setPlayingKey(key))
      .catch(() => setPlayingKey(null));
  }

  return { playingKey, toggle };
}
