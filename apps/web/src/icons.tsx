export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    play: 'm9 5 11 7-11 7Z',
    pause: 'M8 5v14M16 5v14',
    stop: 'M6 6h12v12H6Z',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',
    mic: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0ZM5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8',
    screen: 'M3 4h18v13H3ZM8 21h8m-4-4v4',
    wave: 'M3 10v4m4-8v12m5-15v18m5-15v12m4-8v4',
    sliders: 'M4 7h8m4 0h4M4 17h3m4 0h9M12 4v6M7 14v6',
    expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
    close: 'm6 6 12 12M6 18 18 6',
    chevron: 'm9 5 7 7-7 7',
    volume: 'M3 9h4l5-4v14l-5-4H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
    check: 'm5 12 4 4L19 6',
    info: 'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.wave} />
    </svg>
  );
}
