import React, { useRef } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';

interface MeasurementPointProps {
  id: string;
  initialX: number;
  initialY: number;
  scale: number;
  color: string;
  onMove: (x: number, y: number) => void;
  onActive: (active: boolean, x: number, y: number) => void;
}

export function MeasurementPoint({
  id,
  initialX,
  initialY,
  scale,
  color,
  onMove,
  onActive,
}: MeasurementPointProps) {
  const startPos = useRef({ x: initialX, y: initialY });
  const currPos = useRef({ x: initialX, y: initialY });
  currPos.current = { x: initialX, y: initialY };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startPos.current = { x: currPos.current.x, y: currPos.current.y };
        onActive(true, currPos.current.x, currPos.current.y);
      },
      onPanResponderMove: (e, gesture) => {
        const newX = startPos.current.x + gesture.dx * scale;
        const newY = startPos.current.y + gesture.dy * scale;
        onActive(true, newX, newY);
        onMove(newX, newY);
      },
      onPanResponderRelease: (e, gesture) => {
        const newX = startPos.current.x + gesture.dx * scale;
        const newY = startPos.current.y + gesture.dy * scale;
        onActive(false, newX, newY);
        onMove(newX, newY);
      },
    })
  ).current;

  const displayX = initialX / scale;
  const displayY = initialY / scale;

  return (
    <View
      {...panResponder.panHandlers}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={[
        styles.container,
        {
          left: displayX - 32,
          top: displayY - 32,
        },
      ]}
    >
      <View style={[styles.innerPoint, { backgroundColor: `${color}80` }]}>
        <View style={[styles.centerDot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 32,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 5,
  },
  innerPoint: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  }
});
