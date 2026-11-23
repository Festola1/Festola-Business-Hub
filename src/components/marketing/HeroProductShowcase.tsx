import { useState } from 'react';
import heroShopOwnerImg from '../../assets/images/hero_nigerian_shop_owner_1795177263576.jpg';

/**
 * Full-bleed Hero background photography of a Nigerian retail shop owner in a bright,
 * modern store environment — completely unobstructed with no dashboard overlay.
 */
export function HeroBackgroundLayer() {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-[#F9FAFB] to-[#FFF2F2]"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
      <img
        src={heroShopOwnerImg}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setImageError(true)}
        className="h-full w-full object-cover object-[78%_18%]"
      />
      {/* Directional readability fade on the left half only — leaves the shop owner completely clear on the right */}
      <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 via-[46%] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white/80 to-transparent" />
    </div>
  );
}

/**
 * Mobile & tablet full-width hero image so visitors on smaller screens see the
 * entire unobstructed shop owner photograph cleanly below the hero copy.
 */
export function HeroMobilePhoto() {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return null;
  }

  return (
    <div className="mt-10 overflow-hidden rounded-2xl border border-[#EAECF0] shadow-md lg:hidden">
      <img
        src={heroShopOwnerImg}
        alt="Smiling Nigerian small-business shop owner standing in a bright, modern retail store"
        referrerPolicy="no-referrer"
        onError={() => setImageError(true)}
        className="aspect-[4/3] w-full object-cover object-[75%_18%]"
      />
    </div>
  );
}
