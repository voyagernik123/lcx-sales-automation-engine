declare module 'react-usa-map' {
  import * as React from 'react';

  export interface USAMapProps {
    title?: string;
    width?: number;
    height?: number;
    onClick?: (e: React.MouseEvent<SVGPathElement> & { target: { dataset: { name: string } } }) => void;
    customize?: Record<string, {
      fill?: string;
      clickHandler?: (e: React.MouseEvent<SVGPathElement> & { target: { dataset: { name: string } } }) => void;
    }>;
    defaultColor?: string;
  }

  const USAMap: React.FC<USAMapProps>;
  export default USAMap;
}
