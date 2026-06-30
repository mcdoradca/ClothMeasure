import { useMemo } from 'react';

export interface Point {
  x: number;
  y: number;
}

export interface CoordinateSpace {
  imageWidth: number;
  imageHeight: number;
  containerWidth: number;
  containerHeight: number;
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
  imageToScreen: (p: Point) => Point;
  screenToImage: (p: Point) => Point;
}

export function computeCoordinateSpace(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number
): Omit<CoordinateSpace, 'imageToScreen' | 'screenToImage'> & {
  imageToScreen: (p: Point) => Point;
  screenToImage: (p: Point) => Point;
} {
  const imgW = imageWidth || 1200;
  const imgH = imageHeight || 1600;
  const cWidth = containerWidth || 1;
  const cHeight = containerHeight || 1;

  const imgAspect = imgW / imgH;
  const viewAspect = cWidth / cHeight;

  let renderedWidth: number;
  let renderedHeight: number;
  let offsetX: number;
  let offsetY: number;

  if (imgAspect > viewAspect) {
    renderedWidth = cWidth;
    renderedHeight = cWidth / imgAspect;
    offsetX = 0;
    offsetY = (cHeight - renderedHeight) / 2;
  } else {
    renderedHeight = cHeight;
    renderedWidth = cHeight * imgAspect;
    offsetX = (cWidth - renderedWidth) / 2;
    offsetY = 0;
  }

  const scale = imgW / renderedWidth;

  const imageToScreen = (p: Point): Point => ({
    x: p.x / scale + offsetX,
    y: p.y / scale + offsetY,
  });

  const screenToImage = (p: Point): Point => ({
    x: (p.x - offsetX) * scale,
    y: (p.y - offsetY) * scale,
  });

  return {
    imageWidth: imgW,
    imageHeight: imgH,
    containerWidth: cWidth,
    containerHeight: cHeight,
    scale,
    renderedWidth,
    renderedHeight,
    offsetX,
    offsetY,
    imageToScreen,
    screenToImage,
  };
}

export function useImageCoordinateSpace(
  imageWidth: number,
  imageHeight: number,
  containerSize: { width: number; height: number }
): CoordinateSpace {
  return useMemo(() => {
    return computeCoordinateSpace(
      imageWidth,
      imageHeight,
      containerSize.width,
      containerSize.height
    );
  }, [imageWidth, imageHeight, containerSize.width, containerSize.height]);
}
