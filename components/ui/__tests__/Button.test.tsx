import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

// Co
import { Button } from '../Button';

describe('Button', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with title', () => {
    const { getByText } = render(
      <Button title="Test Button" onPress={mockOnPress} />
    );
    
    expect(getByText('Test Button')).toBeTruthy();
  });

  it('should call onPress when pressed', () => {
    const { getByText } = render(
      <Button title="Test Button" onPress={mockOnPress} />
    );
    
    const button = getByText('Test Button');
    fireEvent.press(button);
    
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('should not call onPress when disabled', () => {
    const { getByText } = render(
      <Button title="Test Button" onPress={mockOnPress} disabled />
    );
    
    const button = getByText('Test Button');
    fireEvent.press(button);
    
    expect(mockOnPress).not.toHaveBeenCalled();
  });

  it('should show loading indicator when loading', () => {
    const { getByTestId, queryByText } = render(
      <Button title="Test Button" onPress={mockOnPress} loading />
    );
    
    expect(getByTestId('activity-indicator')).toBeTruthy();
    expect(queryByText('Test Button')).toBeNull();
  });

  it('should render with primary variant by default', () => {
    const { getByText } = render(
      <Button title="Test Button" onPress={mockOnPress} />
    );
    
    const button = getByText('Test Button').parent;
    expect(button).toBeTruthy();
  });

  it('should render with secondary variant', () => {
    const { getByText } = render(
      <Button title="Test Button" onPress={mockOnPress} variant="secondary" />
    );
    
    expect(getByText('Test Button')).toBeTruthy();
  });

  it('should render with outline variant', () => {
    const { getByText } = render(
      <Button title="Test Button" onPress={mockOnPress} variant="outline" />
    );
    
    expect(getByText('Test Button')).toBeTruthy();
  });

  it('should apply custom style', () => {
    const customStyle = { marginTop: 20 };
    const { getByText } = render(
      <Button title="Test Button" onPress={mockOnPress} style={customStyle} />
    );
    
    expect(getByText('Test Button')).toBeTruthy();
  });
});

