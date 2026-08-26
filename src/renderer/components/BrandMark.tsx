import noobiAppIcon from '../assets/noobi-app-icon.png';

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src={noobiAppIcon} alt="" />
    </span>
  );
}
