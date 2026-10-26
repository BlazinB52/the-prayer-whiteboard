"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import styles from "./littlelights.module.css";

const links = [
  { href: "/littlelights", label: "Home" },
  { href: "/littlelights/scripture-songs", label: "Songs" },
  { href: "/littlelights/activities", label: "Activities" },
];

export function LittleLightsHeader() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Image
          src="/images/littlelights/navigation-banner.svg"
          alt="Little Lights"
          width={1200}
          height={280}
          priority
          className={styles.banner}
        />
        <nav aria-label="Little Lights" className={styles.navigation}>
          {links.map(({ href, label }, index) => {
            const active = href === "/littlelights"
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} prefetch={false}
                className={styles.navLink} style={{ left: `${[5, 35, 71][index]}%`, width: `${[27.5, 34, 24.5][index]}%` }}
                aria-label={label} aria-current={active ? "page" : undefined}>

              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
