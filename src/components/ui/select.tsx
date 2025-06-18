import React from 'react'
import ReactSelect, { Props as ReactSelectProps, StylesConfig } from 'react-select'

const defaultStyles: StylesConfig = {
  control: (base) => ({
    ...base,
    minHeight: '24px',
    height: '24px',
    fontSize: '0.75rem'
  }),
  valueContainer: (base) => ({
    ...base,
    padding: '0 4px'
  }),
  input: (base) => ({
    ...base,
    margin: '0',
    padding: '0'
  }),
  indicatorsContainer: (base) => ({
    ...base,
    height: '24px'
  }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: '0 4px'
  }),
  clearIndicator: (base) => ({
    ...base,
    padding: '0 4px'
  })
}

export const Select: React.FC<ReactSelectProps> = ({ styles, ...props }) => {
  // Apply default styles, allowing custom styles to override
  const finalStyles: StylesConfig = {
    ...defaultStyles,
    ...styles
  }

  return <ReactSelect styles={finalStyles} {...props} />
}

export default Select 