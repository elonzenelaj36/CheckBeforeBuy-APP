/**
 * Outline of a detected room item drawn over a room image that is shown with
 * "cover" (filling its box, cropped). `box` is normalized 0..1 on the image
 * itself; this maps it through the same crop so it lands on the object.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';

type Box = { x1: number; y1: number; x2: number; y2: number };

type Props = {
  box: Box;
  containerWidth: number;
  containerHeight: number;
  /** width / height of the image as displayed (before cropping). */
  imageAspect: number;
  label?: string;
};

/** Pixel rect of a normalized image box inside a container showing that image with "cover". */
export function coverRect(box: Box, containerWidth: number, containerHeight: number, imageAspect: number) {
  const scale = Math.max(containerWidth / imageAspect, containerHeight); // displayed image height
  const shownW = scale * imageAspect;
  const shownH = scale;
  const offsetX = (containerWidth - shownW) / 2;
  const offsetY = (containerHeight - shownH) / 2;
  return {
    left: offsetX + box.x1 * shownW,
    top: offsetY + box.y1 * shownH,
    width: (box.x2 - box.x1) * shownW,
    height: (box.y2 - box.y1) * shownH,
  };
}

export default function ItemHighlight({ box, containerWidth, containerHeight, imageAspect, label }: Props) {
  if (containerWidth <= 0 || containerHeight <= 0 || !(imageAspect > 0)) return null;
  const r = coverRect(box, containerWidth, containerHeight, imageAspect);
  // Entirely outside the visible part (e.g. the item is further round the room): nothing to draw.
  if (r.left + r.width < 0 || r.left > containerWidth || r.top + r.height < 0 || r.top > containerHeight) return null;
  return (
    <View pointerEvents="none" style={[styles.box, r]}>
      {label ? (
        <View style={styles.tag}>
          <Text style={styles.tagText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: Colors.myHomeAccent,
    borderRadius: 8,
    backgroundColor: 'rgba(94, 214, 196, 0.12)',
  },
  tag: {
    position: 'absolute',
    top: -2,
    left: -2,
    backgroundColor: Colors.myHomeAccent,
    borderTopLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 180,
  },
  tagText: {
    color: Colors.cardHighlightText,
    fontSize: 11,
    fontWeight: '800',
  },
});
