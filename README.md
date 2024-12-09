# JSX AutoDocs

This project is inspired by **Prettify TypeScript**, particularly the TypeScript Type Tree Generator from [**prettify-ts**](https://github.com/mylesmmurphy/prettify-ts).

## What this do
From a simple component like this:
```typescript
type ExternalType = {
  requiredProperty: string
  optionalProperty?: string
}

type MyComponentProps = {
  requiredString: string
  requiredNumber: number
  optionalString?: string
  optionalNumber?: number
  requiredArray: ExternalType[]
  optionalArray?: ExternalType[]
  requiredObject: ExternalType
  optionalObject?: ExternalType
  requiredFunction: () => void
  optionalFunction?: () => void
  requiredPromise: () => Promise<any>
  optionalPromise?: () => Promise<any>
}

function MyComponent(props: MyComponentProps) {
  return <div>Hello, jsxAutoDocs</div>
}

export { MyComponent }
```

Is generated an object like this:
```javascript
{
  name: 'MyComponent',
  props: { // These are all the props
    requiredString: '',
    requiredNumber: 0,
    optionalString: '',
    optionalNumber: 0,
    requiredArray: [ { requiredProperty: '', optionalProperty: '' } ],
    optionalArray: [ { requiredProperty: '', optionalProperty: '' } ],
    requiredObject: { requiredProperty: '', optionalProperty: '' },
    optionalObject: { requiredProperty: '', optionalProperty: '' },
    requiredFunction: '() => {}',
    optionalFunction: '() => {}',
    requiredPromise: '() => {}',
    optionalPromise: '() => {}'
  },
  required: { // These are only the required props
    requiredString: '',
    requiredNumber: 0,
    requiredArray: [ { requiredProperty: '' } ],
    requiredObject: { requiredProperty: '' },
    requiredFunction: '() => {}',
    requiredPromise: '() => {}'
  }
}
```

And this object is turned into this one:
```javascript
{
  component: 'MyComponent',
  minimal: '<MyComponent\n' +
    '  requiredString=""\n' +
    '  requiredNumber={0}\n' +
    '  requiredArray={[{\n' +
    '      requiredProperty: ""\n' +
    '    }]}\n' +
    '  requiredObject={\n' +
    '    requiredProperty: ""\n' +
    '  }\n' +
    '  requiredFunction={() => {}}\n' +
    '  requiredPromise={() => {}}\n' +
    '/>',
  complete: '<MyComponent\n' +
    '  requiredString=""\n' +
    '  requiredNumber={0}\n' +
    '  optionalString=""\n' +
    '  optionalNumber={0}\n' +
    '  requiredArray={[{\n' +
    '      requiredProperty: "",\n' +
    '      optionalProperty: ""\n' +
    '    }]}\n' +
    '  optionalArray={[{\n' +
    '      requiredProperty: "",\n' +
    '      optionalProperty: ""\n' +
    '    }]}\n' +
    '  requiredObject={\n' +
    '    requiredProperty: "",\n' +
    '    optionalProperty: ""\n' +
    '  }\n' +
    '  optionalObject={\n' +
    '    requiredProperty: "",\n' +
    '    optionalProperty: ""\n' +
    '  }\n' +
    '  requiredFunction={() => {}}\n' +
    '  optionalFunction={() => {}}\n' +
    '  requiredPromise={() => {}}\n' +
    '  optionalPromise={() => {}}\n' +
    '/>'
}
```

And then you can just represent your component in your docs with a valid JSX signature like this:

### Minimal
(only required props)
```jsx
<MyComponent
  requiredString=""
  requiredNumber={0}
  requiredArray={[{
      requiredProperty: ""
    }]}
  requiredObject={
    requiredProperty: ""
  }
  requiredFunction={() => {}}
  requiredPromise={() => {}}
/>
```

### Complete
(all props)
```jsx
<MyComponent
  requiredString=""
  requiredNumber={0}
  optionalString=""
  optionalNumber={0}
  requiredArray={[{
      requiredProperty: "",
      optionalProperty: ""
    }]}
  optionalArray={[{
      requiredProperty: "",
      optionalProperty: ""
    }]}
  requiredObject={
    requiredProperty: "",
    optionalProperty: ""
  }
  optionalObject={
    requiredProperty: "",
    optionalProperty: ""
  }
  requiredFunction={() => {}}
  optionalFunction={() => {}}
  requiredPromise={() => {}}
  optionalPromise={() => {}}
/>
```

Enjoy and make beautiful automated docs from your components 😊