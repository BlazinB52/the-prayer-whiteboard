"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, House, Palette, Star } from "lucide-react";
import styles from "./littlelights.module.css";

const links = [
  { href: "/littlelights", label: "Home", icon: House },
  { href: "/littlelights/adventures", label: "Adventures", icon: BookOpen },
  { href: "/littlelights/activities", label: "Activities", icon: Palette },
];

export function LittleLightsHeader() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/littlelights" className={styles.brand} aria-label="Little Lights home">
          <span className={styles.brandStars} aria-hidden="true">
            <Star className={styles.largeStar} />
            <Star className={styles.smallStar} />
          </span>
          <span>
            <span className={styles.title}>Little Lights</span>
            <span className={styles.subtitle}>A Kids&apos; Corner of The Prayer Whiteboard</span>
          </span>
        </Link>
        <nav aria-label="Little Lights" className={styles.navigation}>
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/littlelights"
              ? pathname === href
              : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} prefetch={false}
                className={styles.navLink} aria-current={active ? "page" : undefined}>
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
