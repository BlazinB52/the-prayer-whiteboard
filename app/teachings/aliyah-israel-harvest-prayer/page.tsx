import StructuredTeachingPage, { generateMetadata as generateStructuredMetadata } from "../[slug]/page";

const slug = "aliyah-israel-harvest-prayer";

export function generateMetadata() {
  return generateStructuredMetadata({ params: Promise.resolve({ slug }) });
}

export default function AliyahTeachingPage() {
  return <StructuredTeachingPage params={Promise.resolve({ slug })} />;
}
